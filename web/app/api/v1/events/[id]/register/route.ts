import { NextRequest, NextResponse } from 'next/server';
import { processRegistrationAction } from '@/lib/actions/processRegistrationAction';
import { supabaseAdmin } from '@/lib/supabase';
import { db } from '@/db';
import { events, formFields } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getRegistrationFieldKey,
  isStaticRegistrationFieldDefinition,
  RegistrationFormValidationError,
  validateRegistrationAnswers,
  validateRegistrationIdentity,
} from '@/lib/validation/registrationForm';
import { publishTicketGenerationJob } from '@/lib/actions/ticketGenerationJob';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { resetOtpRegistrationRateLimit } from '@/lib/security/otpRateLimit';
import { isPublicEventStatus } from '@/lib/events/eventLifecycle';
import {
  createParticipantFileStoragePath,
  createParticipantFileUploadRequestId,
  createStagedParticipantFileUpload,
  queueParticipantFileUploadsForCleanup,
  reconcileParticipantFileUploads,
} from '@/lib/registration/participantFileLifecycle';
import {
  ParticipantFileValidationError,
  validateParticipantFileContent,
  validateParticipantFileMetadata,
} from '@/lib/validation/participantFile';

export const runtime = 'nodejs';

// Memproyeksikan hasil internal registration ke DTO aman untuk pemanggil publik.
function toPublicRegistrationData(result: {
  registrationId: string;
  status: string;
  reused: boolean;
  ticketJobId: string | null;
  ticketJobStatus: string | null;
  resubmitToken: string | null;
  statusCapability: string | null;
  statusCapabilityExpiresAt: Date | null;
}) {
  return {
    registrationId: result.registrationId,
    status: result.status,
    reused: result.reused,
    ticketJobId: result.ticketJobId,
    ticketJobStatus: result.ticketJobStatus,
    resubmitToken: result.resubmitToken,
    status_token: result.statusCapability,
    status_token_expires_at: result.statusCapabilityExpiresAt?.toISOString() ?? null,
  };
}

class ParticipantFileUploadError extends Error {
  constructor() {
    super('Berkas belum dapat diunggah. Silakan coba lagi.');
    this.name = 'ParticipantFileUploadError';
  }
}

async function cleanupStagedUploads(uploadIds: string[]): Promise<void> {
  if (uploadIds.length === 0) return;
  try {
    await queueParticipantFileUploadsForCleanup(uploadIds);
    await reconcileParticipantFileUploads(uploadIds.length);
  } catch {
    // A durable ledger still records these objects for a later reconciliation.
    console.error('Participant file cleanup scheduling failed');
  }
}

function fileNameFor(value: Blob, fallback: string): string {
  const candidate = (value as Blob & { name?: unknown }).name;
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate.trim() : fallback;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const stagedUploadIds: string[] = [];
  const uploadRequestId = createParticipantFileUploadRequestId();
  let registrationOwnsUploads = false;

  try {
    await reconcileParticipantFileUploads();
    const params = await props.params;
    const slug = params.id;
    
    // Check if it's multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: 'error', message: 'Mesti multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    
    const identity = validateRegistrationIdentity({
      name: formData.get('name'),
      email: formData.get('email'),
    });
    const registrationId = formData.get('registration_id') as string | undefined;
    const resubmitToken = formData.get('resubmit_token') as string | undefined;
    const preserveAnswers = formData.get('retry_only') === 'true';

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
      fieldKey: formFields.fieldKey,
      fieldKind: formFields.fieldKind,
    }).from(formFields).where(eq(formFields.eventId, event.id));

    // Fix validasi: skip field Nama/Email karena dihandle sebagai static field (name/email),
    // bukan sebagai field dinamis dengan key field_{id}
    const dynamicFormFields = eventFormFields.filter(
      (f) => !isStaticRegistrationFieldDefinition(f)
    ).map((field) => ({
      ...field,
      fieldKey: getRegistrationFieldKey(field),
    }));
    const fieldsByKey = new Map(dynamicFormFields.map((field) => [field.fieldKey, field]));

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

    const answers: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawAnswers)) {
      if (value instanceof Blob) {
        // Browser submits an empty File for an optional, unselected input.
        if (value.size === 0) continue;
        const field = fieldsByKey.get(key);
        if (!field || !['file', 'image'].includes(field.fieldType)) {
          throw new RegistrationFormValidationError(`Field ${key} tidak menerima berkas`);
        }

        const fileName = fileNameFor(value, 'berkas');
        const declaredMime = (value as Blob & { type?: string }).type;
        validateParticipantFileMetadata({ fileName, size: value.size, declaredMime, fieldType: field.fieldType });
        const bytes = Buffer.from(await value.arrayBuffer());
        const detectedMime = validateParticipantFileContent({
          fileName,
          declaredMime,
          fieldType: field.fieldType,
          bytes,
        });

        const filePath = createParticipantFileStoragePath(uploadRequestId, fileName);
        const stagedUpload = await createStagedParticipantFileUpload({
          requestId: uploadRequestId,
          fieldKey: key,
          storagePath: filePath,
        });
        stagedUploadIds.push(stagedUpload.id);

        const { error: uploadError } = await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.participantFiles)
          .upload(filePath, bytes, {
            contentType: detectedMime,
            upsert: false,
          });

        if (uploadError) {
          console.error('Participant file upload failed', { uploadId: stagedUpload.id, fieldKey: key });
          throw new ParticipantFileUploadError();
        }

        answers[key] = { fileName, size: value.size, type: detectedMime, path: filePath };
      } else if (Array.isArray(value)) {
        if (value.some((item) => item instanceof Blob)) {
          const field = fieldsByKey.get(key);
          throw new RegistrationFormValidationError(`Field ${field?.fieldName ?? key} hanya menerima satu berkas`);
        }
        answers[key] = value;
      } else {
        answers[key] = value;
      }
    }

    const result = await processRegistrationAction(slug, {
      name: identity.name,
      email: identity.email,
      answers,
      registrationId,
      resubmitToken,
      preserveAnswers,
      fileUploadIds: stagedUploadIds,
      fileUploadRequestId: uploadRequestId,
    });
    // A duplicate/reused registration never references this request's newly
    // staged files, so retain the original response but clean those objects.
    if (result.reused) {
      await cleanupStagedUploads(stagedUploadIds);
    } else {
      // From this point onward the transaction has claimed the objects. Email
      // and QStash failures are retryable and must retain them.
      registrationOwnsUploads = true;
    }

    // BUG-040: Send OTP email if status is Draft and otpCode is generated
    if (result.status === 'Draft' && result.otpCode) {
      // A new OTP invalidates the old verification-attempt budget.
      await resetOtpRegistrationRateLimit(result.registrationId);
      const { sendOtpEmail } = await import('@/lib/email');
      try {
        await sendOtpEmail(identity.email, identity.name, result.otpCode);
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
  } catch (error: unknown) {
    if (!registrationOwnsUploads) await cleanupStagedUploads(stagedUploadIds);

    if (error instanceof ParticipantFileValidationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ParticipantFileUploadError) {
      return NextResponse.json({ status: 'error', code: 'REGISTRATION_FILE_UPLOAD_FAILED', message: error.message }, { status: 502 });
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('QuotaExceededException')) {
      return NextResponse.json({ status: 'error', message }, { status: 400 });
    }
    if (message.includes('NotFoundException')) {
      return NextResponse.json({ status: 'error', message }, { status: 404 });
    }
    if (message.includes('Event belum dipublikasikan')) {
      return NextResponse.json({ status: 'error', message }, { status: 409 });
    }
    if (message.includes('InvalidRegistrationResubmit')) {
      return NextResponse.json({ status: 'error', message: 'Registrasi tidak dapat diperbarui untuk event atau status ini' }, { status: 409 });
    }
    if (error instanceof RegistrationFormValidationError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 422 });
    }
    
    console.error('Registration Error');
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
