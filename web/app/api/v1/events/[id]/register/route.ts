import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { processRegistrationAction } from '@/lib/actions/processRegistrationAction';
import { supabaseAdmin } from '@/lib/supabase';
import { db } from '@/db';
import { eventApprovalEmailTemplates, events, formFields } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  getRegistrationFieldKey,
  isRegistrationFileValue,
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
  readonly providerCode: unknown;

  constructor(providerCode?: unknown) {
    super('Berkas belum dapat diunggah. Silakan coba lagi.');
    this.name = 'ParticipantFileUploadError';
    this.providerCode = providerCode;
  }
}

function requestIdFor(req: NextRequest): string {
  return req.headers.get('x-request-id')?.trim()
    || req.headers.get('x-vercel-id')?.trim()
    || randomUUID();
}

function safeErrorCode(error: unknown): string {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null;
  const cause = record?.cause && typeof record.cause === 'object'
    ? record.cause as Record<string, unknown>
    : null;
  const candidates = [
    cause?.code,
    record?.code,
    record?.errorCode,
    record?.statusCode,
    error instanceof ParticipantFileUploadError ? error.providerCode : undefined,
    error instanceof Error ? error.name : undefined,
  ];
  const candidate = candidates.find((value) => typeof value === 'string' || typeof value === 'number');
  const normalized = candidate === undefined ? '' : String(candidate);
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(normalized) ? normalized : 'UNCLASSIFIED';
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value)) return null;
  return value;
}

function safeDatabaseDetails(error: unknown): {
  code: string | null;
  queryShape: string | null;
  table: string | null;
  column: string | null;
  constraint: string | null;
  detail: string | null;
} {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null;
  const cause = record?.cause && typeof record.cause === 'object'
    ? record.cause as Record<string, unknown>
    : null;
  const provider = cause ?? record;
  const rawQuery = typeof record?.query === 'string'
    ? record.query
    : typeof cause?.query === 'string' ? cause.query : null;
  const queryShape = rawQuery
    ? rawQuery
      .replace(/'(?:''|[^'])*'/g, "'?'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 512)
    : null;
  const queryTableMatch = rawQuery?.match(/\b(?:from|into|update|join)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i);
  const queryTable = queryTableMatch ? safeIdentifier(queryTableMatch[1]) : null;

  return {
    code: typeof provider?.code === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(provider.code)
      ? provider.code
      : null,
    queryShape,
    table: safeIdentifier(provider?.table) ?? queryTable,
    column: safeIdentifier(provider?.column),
    constraint: safeIdentifier(provider?.constraint),
    detail: typeof provider?.detail === 'string' ? redactLogText(provider.detail) : null,
  };
}

function safeFailureCategory(stage: string, error: unknown): string {
  if (error instanceof RegistrationFormValidationError || error instanceof ParticipantFileValidationError) {
    return 'validation';
  }
  if (stage.includes('participant_file') || stage.includes('storage')) return 'storage';
  if (stage.startsWith('otp')) return stage.includes('template') ? 'database' : 'provider';
  if (stage.includes('ticket_job')) return 'queue';
  if (stage.includes('load_event') || stage.includes('form_fields') || stage.includes('registration')) return 'database';
  return 'unexpected';
}

function userFailureMessage(stage: string): string {
  if (stage.includes('participant_file') || stage.includes('storage')) {
    return 'Berkas pendaftaran belum dapat diproses. Periksa format dan ukuran berkas, lalu coba lagi.';
  }
  if (stage === 'persist_registration') {
    return 'Gagal menyimpan registrasi. Silakan coba lagi.';
  }
  if (stage === 'load_event' || stage === 'load_form_fields') {
    return 'Konfigurasi acara belum dapat dimuat. Silakan coba lagi.';
  }
  return 'Pendaftaran gagal diproses. Silakan coba lagi.';
}

function redactLogText(value: string, maxLength = 512): string {
  return value
    .replace(/\bhttps?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(DATABASE_URL|DIRECT_URL|SUPABASE_SERVICE_ROLE_KEY|BREVO_API_KEY)\s*=\s*\S+/gi, '$1=[redacted]')
    .replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b(params|query|sql)\s*:\s*[^\r\n]*/gi, '$1: [redacted]')
    .slice(0, maxLength);
}

function safeErrorDetails(error: unknown): {
  errorName: string;
  errorMessage: string;
  errorStack: string | null;
} {
  const rawName = error instanceof Error ? error.name : typeof error;
  const errorName = /^[A-Za-z0-9_.:-]{1,80}$/.test(rawName) ? rawName : 'UnknownError';
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const rawStack = error instanceof Error ? error.stack : '';
  return {
    errorName,
    errorMessage: redactLogText(rawMessage),
    errorStack: rawStack ? redactLogText(rawStack, 1024) : null,
  };
}

type RegistrationFailureContext = {
  eventSlug?: string | null;
  eventId?: string | null;
  fieldTypes?: string[];
  stagedFileCount?: number;
  uploadedFileCount?: number;
  startedAtMs?: number;
};

function logRegistrationFailure(
  requestId: string,
  stage: string,
  error: unknown,
  category?: string,
  context: RegistrationFailureContext = {},
): void {
  const details = safeErrorDetails(error);
  const database = safeDatabaseDetails(error);
  console.error('registration_failed', {
    requestId,
    eventSlug: context.eventSlug ?? null,
    eventId: context.eventId ?? null,
    failureStage: stage,
    category: category ?? safeFailureCategory(stage, error),
    errorCode: safeErrorCode(error),
    errorName: details.errorName,
    errorMessage: details.errorMessage,
    errorStack: details.errorStack,
    dbCode: database.code,
    database,
    fieldTypes: context.fieldTypes ?? [],
    uploadStatus: {
      staged: context.stagedFileCount ?? 0,
      uploaded: context.uploadedFileCount ?? 0,
    },
    durationMs: context.startedAtMs === undefined
      ? null
      : Math.max(0, Date.now() - context.startedAtMs),
  });
}

async function cleanupStagedUploads(uploadIds: string[]): Promise<void> {
  if (uploadIds.length === 0) return;
  try {
    // The cleanup ledger is the durable hand-off.  Do not perform a storage
    // delete in the registration response path: a provider timeout must not
    // turn an already classified registration failure into a second timeout.
    await queueParticipantFileUploadsForCleanup(uploadIds);
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
  const requestId = requestIdFor(req);
  const startedAtMs = Date.now();
  let registrationOwnsUploads = false;
  let failureStage = 'request';
  let eventSlugForLog: string | null = null;
  let eventIdForLog: string | null = null;
  let fieldTypesForLog: string[] = [];
  let uploadedFileCount = 0;

  try {
    failureStage = 'parse_request';
    const params = await props.params;
    const slug = params.id;
    eventSlugForLog = slug;
    
    // Check if it's multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: 'error', message: 'Mesti multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    
    failureStage = 'validate_identity';
    const identity = validateRegistrationIdentity({
      name: formData.get('name'),
      email: formData.get('email'),
    });
    const registrationId = formData.get('registration_id') as string | undefined;
    const resubmitToken = formData.get('resubmit_token') as string | undefined;
    const preserveAnswers = formData.get('retry_only') === 'true';

    failureStage = 'load_event';
    const [event] = await db.select({ id: events.id, name: events.name, status: events.status }).from(events).where(eq(events.slug, slug)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }
    eventIdForLog = event.id;
    if (!isPublicEventStatus(event.status)) {
      return NextResponse.json({ status: 'error', message: 'Event belum dipublikasikan atau sudah dibatalkan' }, { status: 409 });
    }
    failureStage = 'load_form_fields';
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
    fieldTypesForLog = eventFormFields.map((field) => field.fieldType).slice(0, 25);

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
    failureStage = 'validate_answers';
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
      if (isRegistrationFileValue(value)) {
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
        failureStage = 'stage_participant_file';
        const stagedUpload = await createStagedParticipantFileUpload({
          requestId: uploadRequestId,
          fieldKey: key,
          storagePath: filePath,
        });
        stagedUploadIds.push(stagedUpload.id);

        failureStage = 'upload_participant_file';
        const { error: uploadError } = await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.participantFiles)
          .upload(filePath, bytes, {
            contentType: detectedMime,
            upsert: false,
          });

        if (uploadError) {
          logRegistrationFailure(requestId, failureStage, uploadError, 'storage', {
            eventSlug: eventSlugForLog,
            eventId: eventIdForLog,
            fieldTypes: fieldTypesForLog,
            stagedFileCount: stagedUploadIds.length,
            uploadedFileCount,
            startedAtMs,
          });
          throw new ParticipantFileUploadError(uploadError.statusCode);
        }

        uploadedFileCount += 1;

        answers[key] = { fileName, size: value.size, type: detectedMime, path: filePath };
      } else if (Array.isArray(value)) {
        if (value.some((item) => isRegistrationFileValue(item))) {
          const field = fieldsByKey.get(key);
          throw new RegistrationFormValidationError(`Field ${field?.fieldName ?? key} hanya menerima satu berkas`);
        }
        answers[key] = value;
      } else {
        answers[key] = value;
      }
    }

    failureStage = 'persist_registration';
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
      try {
        failureStage = 'otp_rate_limit_reset';
        // A new OTP invalidates the old verification-attempt budget.
        await resetOtpRegistrationRateLimit(result.registrationId);

        failureStage = 'otp_template_load';
        const { sendOtpEmail } = await import('@/lib/email');
        const [otpTemplate] = await db
          .select({
            subject: eventApprovalEmailTemplates.subject,
            body: eventApprovalEmailTemplates.body,
            isActive: eventApprovalEmailTemplates.isActive,
          })
          .from(eventApprovalEmailTemplates)
          .where(and(
            eq(eventApprovalEmailTemplates.eventId, event.id),
            eq(eventApprovalEmailTemplates.templateKind, 'otp'),
          ))
          .limit(1);
        failureStage = 'otp_delivery';
        await sendOtpEmail(
          identity.email,
          identity.name,
          result.otpCode,
          event.name,
          otpTemplate?.isActive
            ? { subject: otpTemplate.subject, body: otpTemplate.body }
            : undefined,
        );
      } catch (error) {
        logRegistrationFailure(requestId, failureStage, error, undefined, {
          eventSlug: eventSlugForLog,
          eventId: eventIdForLog,
          fieldTypes: fieldTypesForLog,
          stagedFileCount: stagedUploadIds.length,
          uploadedFileCount,
          startedAtMs,
        });
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
        failureStage = 'ticket_job_publish';
        await publishTicketGenerationJob(result.registrationId);
      } catch (publishError) {
        logRegistrationFailure(requestId, failureStage, publishError, 'queue', {
          eventSlug: eventSlugForLog,
          eventId: eventIdForLog,
          fieldTypes: fieldTypesForLog,
          stagedFileCount: stagedUploadIds.length,
          uploadedFileCount,
          startedAtMs,
        });
        failureStage = 'ticket_job_lookup';
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
    logRegistrationFailure(requestId, failureStage, error, undefined, {
      eventSlug: eventSlugForLog,
      eventId: eventIdForLog,
      fieldTypes: fieldTypesForLog,
      stagedFileCount: stagedUploadIds.length,
      uploadedFileCount,
      startedAtMs,
    });
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
    if (message.includes('ParticipantFileClaimFailed')) {
      return NextResponse.json({
        status: 'error',
        code: 'REGISTRATION_FILE_OWNERSHIP_CONFLICT',
        message: 'Berkas pendaftaran berubah sebelum disimpan. Silakan kirim formulir kembali.',
      }, { status: 409 });
    }
    if (error instanceof RegistrationFormValidationError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 422 });
    }
    
    return NextResponse.json({
      status: 'error',
      code: 'REGISTRATION_UNAVAILABLE',
      message: userFailureMessage(failureStage),
      request_id: requestId,
    }, { status: 500 });
  }
}
