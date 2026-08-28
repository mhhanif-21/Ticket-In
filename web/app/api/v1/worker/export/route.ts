import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { exportJobs, formFields } from '@/db/schema';
import { markExportJobFailed } from '@/lib/actions/exportJob';
import { type ExportFieldDefinition } from '@/lib/export/csv';
import {
  createExportStoragePath,
  ExportStorageUploadError,
  uploadExportCsv,
} from '@/lib/export/storageExport';
import { readVerifiedQStashBody } from '@/lib/security/qstash';
import {
  activateHeldStorageCleanupJobs,
  holdStorageCleanupJobs,
  releaseHeldStorageCleanupJobsTx,
} from '@/lib/storage/cleanupLifecycle';
import { EXPORT_STORAGE_BUCKET } from '@/lib/storage/buckets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let jobId: string | null = null;
  let eventId: string | null = null;
  let stagedObject: { bucket: string; storagePath: string; reason: 'export_generation' } | null = null;

  try {
    const rawBody = await readVerifiedQStashBody(request);
    if (!rawBody) {
      return NextResponse.json({ error: 'Unauthorized webhook call' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as { job_id?: unknown; event_id?: unknown };
    if (typeof body.job_id !== 'string' || typeof body.event_id !== 'string') {
      return NextResponse.json({ error: 'Missing job_id or event_id' }, { status: 400 });
    }
    jobId = body.job_id;
    eventId = body.event_id;

    const [job] = await db
      .select()
      .from(exportJobs)
      .where(and(eq(exportJobs.id, jobId), eq(exportJobs.eventId, eventId)))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Export job tidak ditemukan untuk event ini' }, { status: 404 });
    }

    if (job.status === 'completed' && job.storagePath) {
      return NextResponse.json({ status: 'success', data: { job_id: jobId, status: job.status } });
    }

    const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
    const [claimedJob] = await db
      .update(exportJobs)
      .set({
        status: 'processing',
        attempts: sql`${exportJobs.attempts} + 1`,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(exportJobs.id, jobId),
        eq(exportJobs.eventId, eventId),
        or(
          inArray(exportJobs.status, ['pending', 'published', 'failed']),
          and(eq(exportJobs.status, 'processing'), lt(exportJobs.updatedAt, staleProcessingBefore)),
        ),
      ))
      .returning({ id: exportJobs.id });

    if (!claimedJob) {
      return NextResponse.json({ status: 'success', data: { job_id: jobId, status: job.status } });
    }

    const fieldDefinitions: ExportFieldDefinition[] = await db
      .select({ id: formFields.id, fieldName: formFields.fieldName, order: formFields.order })
      .from(formFields)
      .where(eq(formFields.eventId, eventId))
      .orderBy(asc(formFields.order));

    stagedObject = {
      bucket: EXPORT_STORAGE_BUCKET,
      storagePath: createExportStoragePath(eventId, jobId),
      reason: 'export_generation',
    };
    await holdStorageCleanupJobs([stagedObject]);
    const uploaded = await uploadExportCsv({ eventId, jobId, fields: fieldDefinitions });

    const completed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(exportJobs)
        .set({
          status: 'completed',
          // File URLs are signed only when an authorized admin polls the job.
          fileUrl: null,
          storagePath: uploaded.storagePath,
          completedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(exportJobs.id, jobId!),
          eq(exportJobs.eventId, eventId!),
          eq(exportJobs.status, 'processing'),
        ))
        .returning({ id: exportJobs.id });
      if (!updated) throw new Error('export_job_completion_state_changed');
      await releaseHeldStorageCleanupJobsTx(tx, [stagedObject!]);
      return updated;
    });
    if (!completed) throw new Error('export_job_completion_state_changed');

    return NextResponse.json({ status: 'success', data: { job_id: jobId, status: 'completed' } });
  } catch (error) {
    if (stagedObject) {
      await activateHeldStorageCleanupJobs([stagedObject]).catch(() => undefined);
    }
    console.error('Export worker error:', {
      error: error instanceof Error ? error.name : 'unknown',
      ...(error instanceof ExportStorageUploadError
        ? { storageStatus: error.status, providerCode: error.providerCode }
        : {}),
    });
    if (jobId) {
      try {
        await markExportJobFailed(jobId, error);
      } catch (jobError) {
        console.error('Unable to persist export job failure:', { error: jobError instanceof Error ? jobError.name : 'unknown' });
      }
    }
    return NextResponse.json({
      status: 'error',
      message: 'Export worker gagal memproses job.',
      data: { job_id: jobId, event_id: eventId, status: 'failed', retryable: true },
    }, { status: 500 });
  }
}
