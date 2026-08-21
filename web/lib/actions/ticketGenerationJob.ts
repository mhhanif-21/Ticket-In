import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { registrations, ticketGenerationJobs } from '../../db/schema';
import { publishJob } from '../services/qstash';

export type TicketGenerationJobStatus = 'queued' | 'publishing' | 'published' | 'processing' | 'failed' | 'completed';

export interface TicketGenerationJob {
  id: string;
  registrationId: string;
  status: string;
  attempts: number;
  qstashMessageId: string | null;
  lastError: string | null;
}

export async function ensureTicketGenerationJobTx(tx: any, registrationId: string): Promise<TicketGenerationJob> {
  const [inserted] = await tx
    .insert(ticketGenerationJobs)
    .values({ registrationId, status: 'queued' as TicketGenerationJobStatus })
    .onConflictDoNothing({ target: ticketGenerationJobs.registrationId })
    .returning({
      id: ticketGenerationJobs.id,
      registrationId: ticketGenerationJobs.registrationId,
      status: ticketGenerationJobs.status,
      attempts: ticketGenerationJobs.attempts,
      qstashMessageId: ticketGenerationJobs.qstashMessageId,
      lastError: ticketGenerationJobs.lastError,
    });

  if (inserted) return inserted;

  const [existing] = await tx
    .select({
      id: ticketGenerationJobs.id,
      registrationId: ticketGenerationJobs.registrationId,
      status: ticketGenerationJobs.status,
      attempts: ticketGenerationJobs.attempts,
      qstashMessageId: ticketGenerationJobs.qstashMessageId,
      lastError: ticketGenerationJobs.lastError,
    })
    .from(ticketGenerationJobs)
    .where(eq(ticketGenerationJobs.registrationId, registrationId))
    .limit(1);

  if (!existing) throw new Error('Ticket generation job could not be created');
  return existing;
}

export async function getTicketGenerationJob(registrationId: string): Promise<TicketGenerationJob | null> {
  const [job] = await db
    .select({
      id: ticketGenerationJobs.id,
      registrationId: ticketGenerationJobs.registrationId,
      status: ticketGenerationJobs.status,
      attempts: ticketGenerationJobs.attempts,
      qstashMessageId: ticketGenerationJobs.qstashMessageId,
      lastError: ticketGenerationJobs.lastError,
    })
    .from(ticketGenerationJobs)
    .where(eq(ticketGenerationJobs.registrationId, registrationId))
    .limit(1);
  return job || null;
}

export async function ensureTicketGenerationJob(registrationId: string): Promise<TicketGenerationJob> {
  return db.transaction((tx) => ensureTicketGenerationJobTx(tx, registrationId));
}

// Mengklaim satu delivery worker sebelum side effect Storage agar duplicate delivery tidak bekerja paralel.
export async function claimTicketGenerationJob(registrationId: string): Promise<{ job: TicketGenerationJob; claimed: boolean }> {
  const job = (await getTicketGenerationJob(registrationId)) || await ensureTicketGenerationJob(registrationId);
  const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
  const [claimed] = await db
    .update(ticketGenerationJobs)
    .set({
      status: 'processing',
      attempts: sql`${ticketGenerationJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(ticketGenerationJobs.id, job.id),
      or(
        inArray(ticketGenerationJobs.status, ['queued', 'published', 'failed']),
        and(eq(ticketGenerationJobs.status, 'processing'), lt(ticketGenerationJobs.updatedAt, staleProcessingBefore)),
      ),
    ))
    .returning({
      id: ticketGenerationJobs.id,
      registrationId: ticketGenerationJobs.registrationId,
      status: ticketGenerationJobs.status,
      attempts: ticketGenerationJobs.attempts,
      qstashMessageId: ticketGenerationJobs.qstashMessageId,
      lastError: ticketGenerationJobs.lastError,
    });

  return { job: claimed || job, claimed: Boolean(claimed) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function publishTicketGenerationJob(registrationId: string): Promise<TicketGenerationJob> {
  const job = await getTicketGenerationJob(registrationId);
  if (!job) throw new Error('Ticket generation job not found');
  if (job.status === 'published' || job.status === 'completed') return job;

  const stalePublishingBefore = new Date(Date.now() - 5 * 60 * 1000);
  const [claimed] = await db
    .update(ticketGenerationJobs)
    .set({
      status: 'publishing',
      attempts: sql`${ticketGenerationJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(ticketGenerationJobs.id, job.id),
      or(
        inArray(ticketGenerationJobs.status, ['queued', 'failed']),
        and(eq(ticketGenerationJobs.status, 'publishing'), lt(ticketGenerationJobs.updatedAt, stalePublishingBefore)),
      ),
    ))
    .returning({
      id: ticketGenerationJobs.id,
      registrationId: ticketGenerationJobs.registrationId,
      status: ticketGenerationJobs.status,
      attempts: ticketGenerationJobs.attempts,
      qstashMessageId: ticketGenerationJobs.qstashMessageId,
      lastError: ticketGenerationJobs.lastError,
    });

  if (!claimed) return (await getTicketGenerationJob(registrationId))!;

  try {
    const published = await publishJob({
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/worker/process-ticket`,
      body: { registration_id: registrationId },
    });
    const messageId = typeof published === 'object' && published !== null && 'messageId' in published
      ? String((published as { messageId?: unknown }).messageId || '')
      : null;
    const [updated] = await db
      .update(ticketGenerationJobs)
      .set({
        status: 'published',
        qstashMessageId: messageId,
        lastError: null,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(ticketGenerationJobs.id, job.id),
        eq(ticketGenerationJobs.status, 'publishing'),
      ))
      .returning({
        id: ticketGenerationJobs.id,
        registrationId: ticketGenerationJobs.registrationId,
        status: ticketGenerationJobs.status,
        attempts: ticketGenerationJobs.attempts,
        qstashMessageId: ticketGenerationJobs.qstashMessageId,
        lastError: ticketGenerationJobs.lastError,
      });
    return updated || (await getTicketGenerationJob(registrationId))!;
  } catch (error) {
    await db
      .update(ticketGenerationJobs)
      .set({
        status: 'failed',
        lastError: errorMessage(error),
        updatedAt: new Date(),
      })
      .where(eq(ticketGenerationJobs.id, job.id));
    throw error;
  }
}

export async function markTicketGenerationJobCompleted(registrationId: string): Promise<void> {
  await db
    .update(ticketGenerationJobs)
    .set({ status: 'completed', completedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(ticketGenerationJobs.registrationId, registrationId));
}

export async function markTicketGenerationJobFailed(registrationId: string, error: unknown): Promise<void> {
  await db
    .update(ticketGenerationJobs)
    .set({ status: 'failed', lastError: errorMessage(error), updatedAt: new Date() })
    .where(eq(ticketGenerationJobs.registrationId, registrationId));
}

export async function registrationIsAccepted(registrationId: string): Promise<boolean> {
  const [registration] = await db
    .select({ status: registrations.status })
    .from(registrations)
    .where(eq(registrations.id, registrationId))
    .limit(1);
  return registration?.status === 'Accepted';
}
