import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { client } from '../db';

const MIGRATION_ID = '0007_batch4_lifecycle-export-labels';
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/0007_batch4_lifecycle-export-labels.sql',
);
const MIGRATION_LOCK_KEY = 2026082207;
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 2_000;

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
  const columns = await client.unsafe<SchemaRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'status'
  `);

  if (columns.length !== 1) {
    throw new Error(
      `Migration verification failed: public.events.status is missing after ${MIGRATION_ID}`,
    );
  }
}

async function applyLifecycleMigration(): Promise<void> {
  const migrationSql = await readFile(MIGRATION_PATH, 'utf8');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.begin(async (transaction) => {
        await transaction.unsafe(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
        await transaction.unsafe(migrationSql);
      });

      await verifyLifecycleSchema();
      console.log(`Database migration ${MIGRATION_ID} applied and verified.`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Database migration ${MIGRATION_ID} failed after ${MAX_ATTEMPTS} attempts: ${getErrorMessage(error)}`,
        );
      }

      console.warn(
        `Database migration attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${RETRY_DELAY_MS}ms.`,
      );
      await wait(RETRY_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  await applyLifecycleMigration();
}

main()
  .catch((error: unknown) => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
