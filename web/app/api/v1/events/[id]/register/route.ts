import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { processRegistrationAction } from '@/lib/actions/processRegistrationAction';
import { supabaseAdmin } from '@/lib/supabase';
import { db } from '@/db';
import { events, formFields } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getRegistrationFieldKey, isStaticRegistrationField, RegistrationFormValidationError, validateRegistrationAnswers } from '@/lib/validation/registrationForm';
import { publishTicketGenerationJob } from '@/lib/actions/ticketGenerationJob';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { resetOtpRegistrationRateLimit } from '@/lib/security/otpRateLimit';
import { isPublicEventStatus } from '@/lib/events/eventLifecycle';

export const runtime = 'nodejs';

// Memproyeksikan hasil internal registration ke DTO aman untuk pemanggil publik.
function toPublicRegistrationData(result: {
  registrationId: string;
  status: string;
  reused: boolean;
  ticketJobId: string | null;
  ticketJobStatus: string | null;
  resubmitToken: string | null;
}) {
  return {
    registrationId: result.registrationId,
    status: result.status,
    reused: result.reused,
    ticketJobId: result.ticketJobId,
    ticketJobStatus: result.ticketJobStatus,
    resubmitToken: result.resubmitToken,
  };
}

async function cleanupUploadedFiles(uploadedPaths: string[]): Promise<void> {
  if (uploadedPaths.length === 0) return;

  try {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.participantFiles)
      .remove(uploadedPaths);
    if (error) {
      console.error('Registration upload cleanup failed');
    }
  } catch {
    // Cleanup must never replace the original response or reveal storage data.
    console.error('Registration upload cleanup failed');
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const uploadedPaths: string[] = [];
  let registrationCommitted = false;

  try {
    const params = await props.params;
    const slug = params.id;
    
    // Check if it's multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: 'error', message: 'Mesti multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const registrationId = formData.get('registration_id') as string | undefined;
    const resubmitToken = formData.get('resubmit_token') as string | undefined;
    const preserveAnswers = formData.get('retry_only') === 'true';

    if (!name || !email) {
      return NextResponse.json({ status: 'error', message: 'Name and email are required' }, { status: 422 });
    }

    const [event] = await db.select({ id: events.id, status: events.status }).from(events).where(eq(events.slug, slug)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }
    if (!isPublicEventStatus(event.status)) {
      return NextResponse.json({ status: 'error', message: 'Event belum dipublikasikan atau sudah dibatalkan' }, { status: 409 });
    }
    const eventFormFields = await db.select({
      id: formFields.id,
      fieldName: formFields.fieldName,
      fieldType: formFields.fieldType,
      isRequired: formFields.isRequired,
      options: formFields.options,
      order: formFields.order,
    }).from(formFields).where(eq(formFields.eventId, event.id));

    // Fix validasi: skip field Nama/Email karena dihandle sebagai static field (name/email),
    // bukan sebagai field dinamis dengan key field_{id}
    const dynamicFormFields = eventFormFields.filter(
      (f) => !isStaticRegistrationField(f.fieldName)
    ).map((field) => ({
      ...field,
      fieldKey: getRegistrationFieldKey(field),
    }));

    // Validate the untrusted multipart payload before any storage write. The action repeats
    // validation inside its transaction so the backend remains the source of truth.
    const rawAnswers: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'name' || key === 'email' || key === 'registration_id' || key === 'resubmit_token' || key === 'retry_only') continue;
      const existing = rawAnswers[key];
      rawAnswers[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
    if (!preserveAnswers) {
      validateRegistrationAnswers(dynamicFormFields, rawAnswers);
    }

    // Process files and check size limit (1MB)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
    const answers: Record<string, any> = {};

    for (const [key, value] of Object.entries(rawAnswers)) {
      if (key === 'name' || key === 'email' || key === 'registration_id' || key === 'resubmit_token' || key === 'retry_only') continue;

      if (value instanceof Blob) {
        if (value.size > MAX_FILE_SIZE) {
          await cleanupUploadedFiles(uploadedPaths);
          return NextResponse.json({ status: 'error', message: `File size exceeds 1MB limit for field ${key}` }, { status: 413 });
        }

        const arrayBuffer = await value.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const isJPEG = buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isPNG = buffer.length > 7 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;

        if (!isJPEG && !isPNG) {
          await cleanupUploadedFiles(uploadedPaths);
          return NextResponse.json({ status: 'error', message: `Format file tidak valid pada field ${key}. Hanya menerima gambar JPG/PNG.` }, { status: 400 });
        }

        const detectedMime = isJPEG ? 'image/jpeg' : 'image/png';
        const safeFileName = (value as File).name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${slug}/${randomUUID()}-${safeFileName}`;
        // Track the path before upload so a timeout after object creation is
        // cleaned up as part of this request as well.
        uploadedPaths.push(filePath);

        const { error: uploadError } = await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.participantFiles)
          .upload(filePath, buffer, {
            contentType: detectedMime,
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload Error for ${key}`);
          await cleanupUploadedFiles(uploadedPaths);
          return NextResponse.json({ status: 'error', message: `Gagal mengunggah file untuk field ${key}` }, { status: 500 });
        }

        answers[key] = { fileName: (value as File).name, size: value.size, type: detectedMime, path: filePath };
      } else if (Array.isArray(value)) {
        answers[key] = value;
      } else {
        answers[key] = value;
      }
    }

    const result = await processRegistrationAction(slug, {
      name,
      email,
      answers,
      registrationId,
      resubmitToken,
      preserveAnswers,
    });
    // From this point onward the registration transaction has committed. A
    // provider failure is retryable and must retain the uploaded objects.
    registrationCommitted = true;

    // BUG-040: Send OTP email if status is Draft and otpCode is generated
    if (result.status === 'Draft' && result.otpCode) {
      // A new OTP invalidates the old verification-attempt budget.
      await resetOtpRegistrationRateLimit(result.registrationId);
      const { sendOtpEmail } = await import('@/lib/email');
      try {
        await sendOtpEmail(email, name, result.otpCode);
      } catch {
        console.error('OTP delivery failed');
        return NextResponse.json({
          status: 'error',
          message: 'Pendaftaran tersimpan, tetapi OTP belum dapat dikirim. Silakan kirim ulang formulir untuk membuat OTP baru.',
          data: {
            ...toPublicRegistrationData(result),
            otp_delivery: 'failed',
            retryable: true,
          },
        }, { status: 503 });
      }
    }

    // BUG-041: Trigger background ticket generation for Auto-Accept mode
    if (result.status === 'Accepted') {
      try {
        await publishTicketGenerationJob(result.registrationId);
      } catch (publishError) {
        console.error('Ticket generation publish failed:', publishError);
        const job = await import('@/lib/actions/ticketGenerationJob').then(({ getTicketGenerationJob }) => getTicketGenerationJob(result.registrationId));
        return NextResponse.json({
          status: 'error',
          message: 'Pendaftaran diterima, tetapi pekerjaan penerbitan tiket gagal dikirim dan dapat dicoba ulang.',
          data: {
            ...toPublicRegistrationData(result),
            ticketJobId: job?.id || result.ticketJobId,
            ticketJobStatus: job?.status || 'failed',
            retryable: true,
          },
        }, { status: 503 });
      }
    }

    return NextResponse.json({ status: 'success', data: toPublicRegistrationData(result) }, { status: 201 });
  } catch (error: any) {
    if (!registrationCommitted) {
      await cleanupUploadedFiles(uploadedPaths);
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('QuotaExceededException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    }
    if (message.includes('NotFoundException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 404 });
    }
    if (message.includes('Event belum dipublikasikan')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 });
    }
    if (message.includes('InvalidRegistrationResubmit')) {
      return NextResponse.json({ status: 'error', message: 'Registrasi tidak dapat diperbarui untuk event atau status ini' }, { status: 409 });
    }
    if (error instanceof RegistrationFormValidationError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 422 });
    }
    
    console.error('Registration Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
