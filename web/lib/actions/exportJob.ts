import { and, eq, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exportJobs } from '@/db/schema';
import { publishJob } from '@/lib/services/qstash';

export type ExportJobStatus = 'pending' | 'publishing' | 'published' | 'processing' | 'completed' | 'failed';

export interface ExportJobRecord {
  id: string;
  eventId: string;
  status: string;
  fileUrl: string | null;
  storagePath: string | null;
  attempts: number;
  qstashMessageId: string | null;
  lastError: string | null;
  publishedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createExportJob(eventId: string): Promise<ExportJobRecord> {
  const [job] = await db.insert(exportJobs).values({
    eventId,
    status: 'pending',
  }).returning();
  return job as ExportJobRecord;
}

export async function getExportJob(jobId: string): Promise<ExportJobRecord | null> {
  const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId)).limit(1);
  return (job as ExportJobRecord | undefined) || null;
}

/**
 * Publishes exactly one durable job. The database is moved to `failed` before
 * the request returns an error, so callers never see a false success.
 */
export async function publishExportJob(job: ExportJobRecord, workerUrl: string): Promise<ExportJobRecord> {
  const stalePublishingBefore = new Date(Date.now() - 5 * 60 * 1000);
  const [claimed] = await db
    .update(exportJobs)
    .set({
      status: 'publishing',
      attempts: sql`${exportJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(exportJobs.id, job.id),
      eq(exportJobs.eventId, job.eventId),
      or(
        eq(exportJobs.status, 'pending'),
        and(eq(exportJobs.status, 'publishing'), lt(exportJobs.updatedAt, stalePublishingBefore)),
      ),
    ))
    .returning();

  if (!claimed) {
    const current = await getExportJob(job.id);
    if (!current) throw new Error('Export job tidak ditemukan');
    if (current.status === 'published' || current.status === 'completed') return current;
    throw new Error(`Export job tidak dapat dipublikasikan dari status ${current.status}`);
  }

  try {
    const published = await publishJob({
      url: workerUrl,
      body: { job_id: job.id, event_id: job.eventId },
      retries: 3,
    });
    const messageId = typeof published === 'object' && published !== null && 'messageId' in published
      ? String((published as { messageId?: unknown }).messageId || '')
      : null;
    const [updated] = await db
      .update(exportJobs)
      .set({
        status: 'published',
        qstashMessageId: messageId,
        lastError: null,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(exportJobs.id, job.id), eq(exportJobs.status, 'publishing')))
      .returning();
    return (updated as ExportJobRecord | undefined) || (await getExportJob(job.id))!;
  } catch (error) {
    await db.update(exportJobs)
      .set({ status: 'failed', lastError: errorMessage(error), updatedAt: new Date() })
      .where(eq(exportJobs.id, job.id));
    throw error;
  }
}

export async function markExportJobFailed(jobId: string, error: unknown): Promise<void> {
  await db.update(exportJobs)
    .set({ status: 'failed', lastError: errorMessage(error), updatedAt: new Date() })
    .where(eq(exportJobs.id, jobId));
}
