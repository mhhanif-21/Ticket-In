import { randomUUID } from 'node:crypto';

import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { participantFileUploads } from '@/db/schema';
import { supabaseAdmin } from '@/lib/supabase';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';

const STAGING_EXPIRY_MS = 10 * 60 * 1000;
const CLEANUP_LEASE_MS = 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export type ParticipantFileUploadStatus = 'staged' | 'claimed' | 'cleanup_pending' | 'cleaning' | 'cleaned';

export function createParticipantFileUploadRequestId(): string {
  return randomUUID();
}

export function createParticipantFileStoragePath(requestId: string, fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/^\.+/, '') || 'upload';
  return `staging/${requestId}/${randomUUID()}-${safeFileName}`;
}

export async function createStagedParticipantFileUpload(input: {
  requestId: string;
  fieldKey: string;
  storagePath: string;
}) {
  const now = new Date();
  const [created] = await db
    .insert(participantFileUploads)
    .values({
      requestId: input.requestId,
      bucket: STORAGE_BUCKETS.participantFiles,
      storagePath: input.storagePath,
      fieldKey: input.fieldKey,
      status: 'staged',
      expiresAt: new Date(now.getTime() + STAGING_EXPIRY_MS),
      nextAttemptAt: now,
      updatedAt: now,
    })
    .returning({ id: participantFileUploads.id, storagePath: participantFileUploads.storagePath });
  return created;
}

export async function claimParticipantFileUploadsTx(
  tx: any,
  input: { uploadIds: string[]; requestId: string; registrationId: string },
): Promise<void> {
  if (input.uploadIds.length === 0) return;

  const claimed = await tx
    .update(participantFileUploads)
    .set({
      status: 'claimed',
      registrationId: input.registrationId,
      cleanupLeaseExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(
      inArray(participantFileUploads.id, input.uploadIds),
      eq(participantFileUploads.requestId, input.requestId),
      eq(participantFileUploads.status, 'staged'),
    ))
    .returning({ id: participantFileUploads.id });

  if (claimed.length !== input.uploadIds.length) {
    throw new Error('ParticipantFileClaimFailed: staged upload ownership changed');
  }
}

export async function queueParticipantFileUploadsForCleanup(uploadIds: string[]): Promise<void> {
  if (uploadIds.length === 0) return;
  const now = new Date();
  await db
    .update(participantFileUploads)
    .set({
      status: 'cleanup_pending',
      nextAttemptAt: now,
      cleanupLeaseExpiresAt: null,
      updatedAt: now,
    })
    .where(and(
      inArray(participantFileUploads.id, uploadIds),
      eq(participantFileUploads.status, 'staged'),
    ));
}

function cleanupCandidateCondition(now: Date) {
  return or(
    and(
      eq(participantFileUploads.status, 'staged'),
      lte(participantFileUploads.expiresAt, now),
    ),
    and(
      eq(participantFileUploads.status, 'cleanup_pending'),
      lte(participantFileUploads.nextAttemptAt, now),
    ),
    and(
      eq(participantFileUploads.status, 'cleaning'),
      lte(participantFileUploads.cleanupLeaseExpiresAt, now),
    ),
  );
}

async function leaseNextCleanupCandidate() {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: participantFileUploads.id,
        bucket: participantFileUploads.bucket,
        storagePath: participantFileUploads.storagePath,
      })
      .from(participantFileUploads)
      .where(cleanupCandidateCondition(now))
      .limit(1)
      .for('update');
    if (!candidate) return null;

    const [leased] = await tx
      .update(participantFileUploads)
      .set({
        status: 'cleaning',
        attempts: sql`${participantFileUploads.attempts} + 1`,
        cleanupLeaseExpiresAt: new Date(now.getTime() + CLEANUP_LEASE_MS),
        updatedAt: now,
      })
      .where(and(eq(participantFileUploads.id, candidate.id), cleanupCandidateCondition(now)))
      .returning({ id: participantFileUploads.id, bucket: participantFileUploads.bucket, storagePath: participantFileUploads.storagePath });
    return leased ?? null;
  });
}

function safeErrorKind(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z0-9_:-]{1,80}$/.test(error.name)) return error.name;
  return 'storage_cleanup_failed';
}

export async function reconcileParticipantFileUploads(limit = 4): Promise<{ cleaned: number; failed: number }> {
  const result = { cleaned: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    let job: { id: string; bucket: string; storagePath: string } | null = null;
    try {
      job = await leaseNextCleanupCandidate();
      if (!job) break;

      const { error } = await supabaseAdmin.storage.from(job.bucket).remove([job.storagePath]);
      if (error) throw new Error('storage_remove_failed');

      await db
        .update(participantFileUploads)
        .set({
          status: 'cleaned',
          cleanedAt: new Date(),
          cleanupLeaseExpiresAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(participantFileUploads.id, job.id), eq(participantFileUploads.status, 'cleaning')));
      result.cleaned += 1;
    } catch (error) {
      result.failed += 1;
      if (job) {
        await db
          .update(participantFileUploads)
          .set({
            status: 'cleanup_pending',
            nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
            cleanupLeaseExpiresAt: null,
            lastError: safeErrorKind(error),
            updatedAt: new Date(),
          })
          .where(eq(participantFileUploads.id, job.id));
        console.error('Participant file cleanup deferred', { uploadId: job.id, error: safeErrorKind(error) });
      } else {
        console.error('Participant file cleanup sweep failed', { error: safeErrorKind(error) });
        break;
      }
    }
  }
  return result;
}
