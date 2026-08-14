import { NextRequest, NextResponse } from 'next/server';
import { processRegistrationAction } from '@/lib/actions/processRegistrationAction';
import { supabaseAdmin } from '@/lib/supabase';
import { db } from '@/db';
import { events, formFields } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { RegistrationFormValidationError, validateRegistrationAnswers } from '@/lib/validation/registrationForm';
import { publishTicketGenerationJob } from '@/lib/actions/ticketGenerationJob';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    if (!name || !email) {
      return NextResponse.json({ status: 'error', message: 'Name and email are required' }, { status: 422 });
    }

    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }
    const eventFormFields = await db.select({
      id: formFields.id,
      fieldName: formFields.fieldName,
      fieldType: formFields.fieldType,
      isRequired: formFields.isRequired,
      options: formFields.options,
    }).from(formFields).where(eq(formFields.eventId, event.id));

    // Fix validasi: skip field Nama/Email karena dihandle sebagai static field (name/email),
    // bukan sebagai field dinamis dengan key field_{id}
    const dynamicFormFields = eventFormFields.filter(
      (f) => !['nama', 'email'].includes(f.fieldName.toLowerCase())
    );

    // Validate the untrusted multipart payload before any storage write. The action repeats
    // validation inside its transaction so the backend remains the source of truth.
    const rawAnswers: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'name' || key === 'email' || key === 'registration_id' || key === 'resubmit_token') continue;
      const existing = rawAnswers[key];
      rawAnswers[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
    validateRegistrationAnswers(dynamicFormFields, rawAnswers);

    // Process files and check size limit (1MB)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
    const answers: Record<string, any> = {};

    for (const [key, value] of Object.entries(rawAnswers)) {
      if (key === 'name' || key === 'email' || key === 'registration_id' || key === 'resubmit_token') continue;

      if (value instanceof Blob) {
        if (value.size > MAX_FILE_SIZE) {
          return NextResponse.json({ status: 'error', message: `File size exceeds 1MB limit for field ${key}` }, { status: 413 });
        }

        const arrayBuffer = await value.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const isJPEG = buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isPNG = buffer.length > 7 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;

        if (!isJPEG && !isPNG) {
          return NextResponse.json({ status: 'error', message: `Format file tidak valid pada field ${key}. Hanya menerima gambar JPG/PNG.` }, { status: 400 });
        }

        const detectedMime = isJPEG ? 'image/jpeg' : 'image/png';
        const safeFileName = (value as File).name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${slug}/${Date.now()}-${Math.floor(Math.random() * 1000)}-${safeFileName}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.participantFiles)
          .upload(filePath, buffer, {
            contentType: detectedMime,
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload Error for ${key}:`, uploadError);
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
    });

    // BUG-040: Send OTP email if status is Draft and otpCode is generated
    if (result.status === 'Draft' && result.otpCode) {
      const { sendOtpEmail } = await import('@/lib/email');
      try {
        await sendOtpEmail(email, name, result.otpCode);
      } catch (deliveryError) {
        console.error('OTP delivery failed:', deliveryError);
        return NextResponse.json({
          status: 'error',
          message: 'Pendaftaran tersimpan, tetapi OTP belum dapat dikirim. Silakan kirim ulang formulir untuk membuat OTP baru.',
          data: {
            registrationId: result.registrationId,
            status: result.status,
            resubmitToken: result.resubmitToken,
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
          data: { ...result, ticketJobId: job?.id || result.ticketJobId, ticketJobStatus: job?.status || 'failed', retryable: true },
        }, { status: 503 });
      }
    }

    return NextResponse.json({ status: 'success', data: result }, { status: 201 });
  } catch (error: any) {
    if (error.message.includes('QuotaExceededException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    }
    if (error.message.includes('NotFoundException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 404 });
    }
    if (error.message.includes('InvalidRegistrationResubmit')) {
      return NextResponse.json({ status: 'error', message: 'Registrasi tidak dapat diperbarui untuk event atau status ini' }, { status: 409 });
    }
    if (error instanceof RegistrationFormValidationError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 422 });
    }
    
    console.error('Registration Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
