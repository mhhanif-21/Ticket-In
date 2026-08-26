import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { storageCleanupJobs } from '@/db/schema';
import { supabaseAdmin } from '@/lib/supabase';

const HOLD_EXPIRY_MS = 10 * 60 * 1000;
const CLEANUP_LEASE_MS = 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export type StorageCleanupReason = 'event_media_replace' | 'ticket_template_replace' | 'event_delete' | 'export_generation';

type StorageObject = {
  bucket: string;
  storagePath: string;
};

type StorageCleanupInput = StorageObject & {
  reason: StorageCleanupReason;
};

function uniqueObjects<T extends StorageObject>(objects: T[]): T[] {
  const seen = new Set<string>();
  return objects.filter((object) => {
    const key = `${object.bucket}\u0000${object.storagePath}`;
    if (!object.storagePath || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanupCandidateCondition(now: Date) {
  return or(
    and(eq(storageCleanupJobs.status, 'held'), lte(storageCleanupJobs.expiresAt, now)),
    and(eq(storageCleanupJobs.status, 'cleanup_pending'), lte(storageCleanupJobs.nextAttemptAt, now)),
    and(eq(storageCleanupJobs.status, 'cleaning'), lte(storageCleanupJobs.cleanupLeaseExpiresAt, now)),
  );
}

function safeErrorKind(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z0-9_:-]{1,80}$/.test(error.name)) return error.name;
  return 'storage_cleanup_failed';
}

export async function holdStorageCleanupJobs(input: StorageCleanupInput[]): Promise<void> {
  const objects = uniqueObjects(input);
  if (objects.length === 0) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MS);
  for (const object of objects) {
    await db
      .insert(storageCleanupJobs)
      .values({
        bucket: object.bucket,
        storagePath: object.storagePath,
        reason: object.reason,
        status: 'held',
        attempts: 0,
        expiresAt,
        nextAttemptAt: now,
        cleanupLeaseExpiresAt: null,
        cleanedAt: null,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [storageCleanupJobs.bucket, storageCleanupJobs.storagePath],
        set: {
          reason: object.reason,
          status: 'held',
          expiresAt,
          nextAttemptAt: now,
          cleanupLeaseExpiresAt: null,
          cleanedAt: null,
          lastError: null,
          updatedAt: now,
        },
      });
  }
}

export async function releaseHeldStorageCleanupJobsTx(
  tx: any,
  objects: StorageObject[],
): Promise<void> {
  for (const object of uniqueObjects(objects)) {
    await tx
      .delete(storageCleanupJobs)
      .where(and(
        eq(storageCleanupJobs.bucket, object.bucket),
        eq(storageCleanupJobs.storagePath, object.storagePath),
        eq(storageCleanupJobs.status, 'held'),
      ));
  }
}

export async function queueStorageCleanupJobsTx(
  tx: any,
  input: StorageCleanupInput[],
): Promise<void> {
  const objects = uniqueObjects(input);
  if (objects.length === 0) return;

  const now = new Date();
  for (const object of objects) {
    await tx
      .insert(storageCleanupJobs)
      .values({
        bucket: object.bucket,
        storagePath: object.storagePath,
        reason: object.reason,
        status: 'cleanup_pending',
        attempts: 0,
        expiresAt: now,
        nextAttemptAt: now,
        cleanupLeaseExpiresAt: null,
        cleanedAt: null,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [storageCleanupJobs.bucket, storageCleanupJobs.storagePath],
        set: {
          reason: object.reason,
          status: 'cleanup_pending',
          nextAttemptAt: now,
          cleanupLeaseExpiresAt: null,
          cleanedAt: null,
          lastError: null,
          updatedAt: now,
        },
      });
  }
}

export async function activateHeldStorageCleanupJobs(objects: StorageObject[]): Promise<void> {
  const now = new Date();
  for (const object of uniqueObjects(objects)) {
    await db
      .update(storageCleanupJobs)
      .set({
        status: 'cleanup_pending',
        nextAttemptAt: now,
        cleanupLeaseExpiresAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(storageCleanupJobs.bucket, object.bucket),
        eq(storageCleanupJobs.storagePath, object.storagePath),
        eq(storageCleanupJobs.status, 'held'),
      ));
  }
}

async function leaseNextCleanupCandidate() {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: storageCleanupJobs.id,
        bucket: storageCleanupJobs.bucket,
        storagePath: storageCleanupJobs.storagePath,
      })
      .from(storageCleanupJobs)
      .where(cleanupCandidateCondition(now))
      .limit(1)
      .for('update');
    if (!candidate) return null;

    const [leased] = await tx
      .update(storageCleanupJobs)
      .set({
        status: 'cleaning',
        attempts: sql`${storageCleanupJobs.attempts} + 1`,
        cleanupLeaseExpiresAt: new Date(now.getTime() + CLEANUP_LEASE_MS),
        updatedAt: now,
      })
      .where(and(eq(storageCleanupJobs.id, candidate.id), cleanupCandidateCondition(now)))
      .returning({
        id: storageCleanupJobs.id,
        bucket: storageCleanupJobs.bucket,
        storagePath: storageCleanupJobs.storagePath,
      });
    return leased ?? null;
  });
}

export async function reconcileStorageCleanupJobs(limit = 20): Promise<{ cleaned: number; failed: number }> {
  const result = { cleaned: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    let job: { id: string; bucket: string; storagePath: string } | null = null;
    try {
      job = await leaseNextCleanupCandidate();
      if (!job) break;

      const { error } = await supabaseAdmin.storage.from(job.bucket).remove([job.storagePath]);
      if (error) throw new Error('storage_remove_failed');

      await db
        .update(storageCleanupJobs)
        .set({
          status: 'cleaned',
          cleanedAt: new Date(),
          cleanupLeaseExpiresAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(storageCleanupJobs.id, job.id), eq(storageCleanupJobs.status, 'cleaning')));
      result.cleaned += 1;
    } catch (error) {
      result.failed += 1;
      if (!job) break;

      const errorKind = safeErrorKind(error);
      await db
        .update(storageCleanupJobs)
        .set({
          status: 'cleanup_pending',
          nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
          cleanupLeaseExpiresAt: null,
          lastError: errorKind,
          updatedAt: new Date(),
        })
        .where(eq(storageCleanupJobs.id, job.id));
      console.error('Storage cleanup deferred', { cleanupJobId: job.id, error: errorKind });
    }
  }
  return result;
}
