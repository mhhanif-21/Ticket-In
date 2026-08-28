import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { client } from '../db';

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 2_000;

const MIGRATIONS = [
  {
    id: '0007_batch4_lifecycle-export-labels',
    path: resolve(process.cwd(), 'supabase/migrations/0007_batch4_lifecycle-export-labels.sql'),
    lockKey: 2026082207,
  },
  {
    id: '0008_s9_event-media-idempotency',
    path: resolve(process.cwd(), 'supabase/migrations/0008_s9_event-media-idempotency.sql'),
    lockKey: 2026082508,
  },
  {
    id: '0009_s9_ticket-templates',
    path: resolve(process.cwd(), 'supabase/migrations/0009_s9_ticket-templates.sql'),
    lockKey: 2026082609,
  },
  {
    id: '0010_s9_registration-file-lifecycle',
    path: resolve(process.cwd(), 'supabase/migrations/0010_s9_registration-file-lifecycle.sql'),
    lockKey: 2026082610,
  },
  {
    id: '0011_web-security-perimeter',
    path: resolve(process.cwd(), 'supabase/migrations/0011_web-security-perimeter.sql'),
    lockKey: 2026082611,
  },
  {
    id: '0012_registration-event-lifecycle-integrity',
    path: resolve(process.cwd(), 'supabase/migrations/0012_registration-event-lifecycle-integrity.sql'),
    lockKey: 2026082612,
  },
  {
    id: '0013_storage-media-export-durability',
    path: resolve(process.cwd(), 'supabase/migrations/0013_storage-media-export-durability.sql'),
    lockKey: 2026082713,
  },
  {
    id: '0014_manual-review-email-template-kinds',
    path: resolve(process.cwd(), 'supabase/migrations/0014_manual-review-email-template-kinds.sql'),
    lockKey: 2026082714,
  },
  {
    id: '0015_normalize-legacy-ticket-email-tokens',
    path: resolve(process.cwd(), 'supabase/migrations/0015_normalize-legacy-ticket-email-tokens.sql'),
    lockKey: 2026082715,
  },
] as const;

type SchemaRow = {
  column_name: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown database migration error';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function verifyLifecycleSchema(): Promise<void> {
  const requiredEventColumns = [
    'status',
    'creation_key',
    'volunteer_session_version',
    'form_version',
  ];
  const columns = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name IN (
        'status',
        'creation_key',
        'volunteer_session_version',
        'form_version'
      )
  `);

  const presentColumns = new Set(columns.map((row) => row.column_name));
  const missingColumns = requiredEventColumns.filter(
    (column) => !presentColumns.has(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Migration verification failed: public.events columns are missing: ${missingColumns.join(', ')}`,
    );
  }
}

async function verifyEventMediaSchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_media'
      AND column_name = 'public_url'
  `);

  if (rows.length !== 1) {
    throw new Error('Migration verification failed: public.event_media.public_url is missing');
  }
}

async function verifyTicketTemplateSchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_ticket_templates'
      AND column_name = 'elements'
  `);

  if (rows.length !== 1) {
    throw new Error('Migration verification failed: public.event_ticket_templates.elements is missing');
  }
}

async function verifyParticipantFileLifecycleSchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participant_file_uploads'
      AND column_name = 'status'
  `);

  if (rows.length !== 1) {
    throw new Error('Migration verification failed: public.participant_file_uploads.status is missing');
  }
}

async function verifyRegistrationStatusCapabilitySchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'registration_status_capabilities'
      AND column_name = 'token_hash'
  `);

  if (rows.length !== 1) {
    throw new Error('Migration verification failed: public.registration_status_capabilities.token_hash is missing');
  }
}

async function verifyRegistrationLifecycleSchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'form_fields'
      AND column_name IN ('field_key', 'field_kind')
  `);

  if (rows.length !== 2) {
    throw new Error('Migration verification failed: public.form_fields stable identity columns are missing');
  }
}

async function verifyStorageMediaExportSchema(): Promise<void> {
  const cleanupRows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'storage_cleanup_jobs'
      AND column_name = 'storage_path'
  `);
  if (cleanupRows.length !== 1) {
    throw new Error('Migration verification failed: public.storage_cleanup_jobs.storage_path is missing');
  }

  const exportRows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'export_jobs'
      AND column_name = 'storage_path'
  `);
  if (exportRows.length !== 1) {
    throw new Error('Migration verification failed: public.export_jobs.storage_path is missing');
  }
}

async function verifyEmailTemplateKindSchema(): Promise<void> {
  const rows = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_approval_email_templates'
      AND column_name = 'template_kind'
  `);
  if (rows.length !== 1) {
    throw new Error('Migration verification failed: public.event_approval_email_templates.template_kind is missing');
  }
}

async function applyMigration(migration: (typeof MIGRATIONS)[number]): Promise<void> {
  const migrationSql = await readFile(migration.path, 'utf8');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.begin(async (transaction) => {
        await transaction.unsafe(`SELECT pg_advisory_xact_lock(${migration.lockKey})`);
        await transaction.unsafe(migrationSql);
      });

      console.log(`Database migration ${migration.id} applied.`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Database migration ${migration.id} failed after ${MAX_ATTEMPTS} attempts: ${getErrorMessage(error)}`,
        );
      }

      console.warn(
        `Database migration ${migration.id} attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${RETRY_DELAY_MS}ms.`,
      );
      await wait(RETRY_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  for (const migration of MIGRATIONS) {
    await applyMigration(migration);
  }
  await verifyLifecycleSchema();
  await verifyEventMediaSchema();
  await verifyTicketTemplateSchema();
  await verifyParticipantFileLifecycleSchema();
  await verifyRegistrationStatusCapabilitySchema();
  await verifyRegistrationLifecycleSchema();
  await verifyStorageMediaExportSchema();
  await verifyEmailTemplateKindSchema();
  console.log('Database lifecycle, event media, ticket template, participant file, status capability, registration integrity, storage/export, and email template migrations applied and verified.');
}

main()
  .catch((error: unknown) => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
