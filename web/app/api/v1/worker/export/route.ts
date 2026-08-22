import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exportJobs, formFields, registrations } from '@/db/schema';
import { markExportJobFailed } from '@/lib/actions/exportJob';
import { buildExportRow, toCSV, type ExportFieldDefinition } from '@/lib/export/csv';
import { readVerifiedQStashBody } from '@/lib/security/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let jobId: string | null = null;
  let eventId: string | null = null;

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

    if (job.status === 'completed') {
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

    const regs = await db
      .select()
      .from(registrations)
      .where(eq(registrations.eventId, eventId));

    const flattenedData = regs.map((registration) => buildExportRow({
      id: registration.id,
      name: registration.name,
      email: registration.email,
      status: registration.status,
      ticketCode: registration.ticketCode,
      presenceStatus: registration.presenceStatus,
      createdAt: registration.createdAt,
      answers: registration.answers,
      answerFieldLabels: registration.answerFieldLabels,
    }, fieldDefinitions));

    const csvString = toCSV(flattenedData);
    const fileUrl = `data:text/csv;base64,${Buffer.from(csvString).toString('base64')}`;

    await db
      .update(exportJobs)
      .set({
        status: 'completed',
        fileUrl,
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(exportJobs.id, jobId),
        eq(exportJobs.eventId, eventId),
        eq(exportJobs.status, 'processing'),
      ));

    return NextResponse.json({ status: 'success', data: { job_id: jobId, status: 'completed' } });
  } catch (error) {
    console.error('Export worker error:', error);
    if (jobId) {
      try {
        await markExportJobFailed(jobId, error);
      } catch (jobError) {
        console.error('Unable to persist export job failure:', jobError);
      }
    }
    return NextResponse.json({
      status: 'error',
      message: 'Export worker gagal memproses job.',
      data: { job_id: jobId, event_id: eventId, status: 'failed', retryable: true },
    }, { status: 500 });
  }
}
