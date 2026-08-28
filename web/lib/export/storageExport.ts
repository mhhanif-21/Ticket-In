import { and, asc, eq, gt } from 'drizzle-orm';

import { db } from '@/db';
import { registrations } from '@/db/schema';
import {
  buildExportRow,
  csvCell,
  csvRow,
  STANDARD_EXPORT_HEADERS,
  type ExportFieldDefinition,
  type ExportRegistrationRecord,
} from '@/lib/export/csv';
import { EXPORT_STORAGE_BUCKET } from '@/lib/storage/buckets';

const EXPORT_PAGE_SIZE = 500;

type ExportRegistrationPageRow = ExportRegistrationRecord;

export class ExportStorageUploadError extends Error {
  readonly status: number | null;
  readonly providerCode: string | null;

  constructor(status: number | null = null, providerCode: string | null = null) {
    const suffix = status === null ? '' : `:${status}`;
    super(`export_storage_upload_failed${suffix}`);
    this.name = 'ExportStorageUploadError';
    this.status = status;
    this.providerCode = providerCode;
  }
}

export const EXPORT_CSV_CONTENT_TYPE = 'text/csv';

export function createExportUploadHeaders(serviceKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    // Keep this identical to the private `exports` bucket allow-list. A
    // charset parameter would be a different value for exact MIME checks.
    'Content-Type': EXPORT_CSV_CONTENT_TYPE,
    'x-upsert': 'true',
  };
}

function customHeaders(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter(
    (header) => !STANDARD_EXPORT_HEADERS.includes(header as (typeof STANDARD_EXPORT_HEADERS)[number]),
  );
}

async function getRegistrationPage(eventId: string, afterId: string | null): Promise<ExportRegistrationPageRow[]> {
  return db
    .select({
      id: registrations.id,
      name: registrations.name,
      email: registrations.email,
      status: registrations.status,
      ticketCode: registrations.ticketCode,
      presenceStatus: registrations.presenceStatus,
      createdAt: registrations.createdAt,
      answers: registrations.answers,
      answerFieldLabels: registrations.answerFieldLabels,
    })
    .from(registrations)
    .where(afterId
      ? and(eq(registrations.eventId, eventId), gt(registrations.id, afterId))
      : eq(registrations.eventId, eventId))
    .orderBy(asc(registrations.id))
    .limit(EXPORT_PAGE_SIZE);
}

async function collectHeaders(eventId: string, fields: ExportFieldDefinition[]): Promise<string[]> {
  const custom = new Set<string>();
  let afterId: string | null = null;
  while (true) {
    const page = await getRegistrationPage(eventId, afterId);
    if (page.length === 0) break;
    for (const registration of page) {
      for (const header of customHeaders(buildExportRow(registration, fields))) custom.add(header);
    }
    afterId = page.at(-1)?.id ?? null;
    if (page.length < EXPORT_PAGE_SIZE) break;
  }
  return [...STANDARD_EXPORT_HEADERS, ...[...custom].sort((left, right) => left.localeCompare(right))];
}

async function* generateCsvChunks(
  eventId: string,
  fields: ExportFieldDefinition[],
  headers: string[],
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  yield encoder.encode(`${headers.map(csvCell).join(',')}\n`);

  let afterId: string | null = null;
  while (true) {
    const page = await getRegistrationPage(eventId, afterId);
    if (page.length === 0) break;
    yield encoder.encode(`${page.map((registration) => csvRow(headers, buildExportRow(registration, fields))).join('\n')}\n`);
    afterId = page.at(-1)?.id ?? null;
    if (page.length < EXPORT_PAGE_SIZE) break;
  }
}

function streamFromAsyncGenerator(generator: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await generator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await generator.return?.(undefined as never);
    },
  });
}

function storageObjectUrl(bucket: string, storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ExportStorageUploadError();
  const encodedPath = storagePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

export function createExportStoragePath(eventId: string, jobId: string): string {
  return `${eventId}/${jobId}.csv`;
}

/**
 * The header scan and the upload stream both use keyset pagination. At most
 * one 500-row page is held in memory; CSV bytes are never written to Postgres.
 */
export async function uploadExportCsv(input: {
  eventId: string;
  jobId: string;
  fields: ExportFieldDefinition[];
}): Promise<{ storagePath: string }> {
  const headers = await collectHeaders(input.eventId, input.fields);
  const storagePath = createExportStoragePath(input.eventId, input.jobId);
  const stream = streamFromAsyncGenerator(generateCsvChunks(input.eventId, input.fields, headers));
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new ExportStorageUploadError();
  const response = await fetch(storageObjectUrl(EXPORT_STORAGE_BUCKET, storagePath), {
    method: 'POST',
    headers: createExportUploadHeaders(serviceKey),
    body: stream,
    duplex: 'half',
  } as RequestInit);
  if (!response.ok) {
    let providerCode: string | null = null;
    try {
      const payload = await response.json() as { code?: unknown; statusCode?: unknown };
      const candidate = payload.code ?? payload.statusCode;
      if (typeof candidate === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidate)) {
        providerCode = candidate;
      }
    } catch {
      // The worker only needs the HTTP status for a safe diagnostic. Do not
      // persist or log an arbitrary provider response body.
    }
    throw new ExportStorageUploadError(response.status, providerCode);
  }
  return { storagePath };
}
