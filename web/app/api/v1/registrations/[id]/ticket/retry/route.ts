import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ensureTicketGenerationJob,
  getTicketGenerationJob,
  publishTicketGenerationJob,
} from '@/lib/actions/ticketGenerationJob';

export const runtime = 'nodejs';

/**
 * Retry ticket publication for an already accepted registration.
 * This is deliberately separate from Approve so a final review state cannot
 * be changed or accidentally treated as a new approval.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [registration] = await db
      .select({ id: registrations.id, status: registrations.status })
      .from(registrations)
      .where(eq(registrations.id, id))
      .limit(1);

    if (!registration) {
      return NextResponse.json({ status: 'error', message: 'Registration not found' }, { status: 404 });
    }

    if (registration.status !== 'Accepted') {
      return NextResponse.json({
        status: 'error',
        message: 'Ticket generation can only be retried for Accepted registrations',
      }, { status: 409 });
    }

    const job = (await getTicketGenerationJob(id)) || await ensureTicketGenerationJob(id);
    if (job.status === 'completed') {
      return NextResponse.json({
        status: 'error',
        message: 'Ticket generation already completed',
        data: { registrationId: id, jobId: job.id, jobStatus: job.status },
      }, { status: 409 });
    }

    if (!['queued', 'failed'].includes(job.status)) {
      return NextResponse.json({
        status: 'error',
        message: 'Ticket generation is processing',
        data: { registrationId: id, jobId: job.id, jobStatus: job.status },
      }, { status: 409 });
    }

    try {
      const published = await publishTicketGenerationJob(id);
      return NextResponse.json({
        status: 'success',
        message: 'Ticket retry queued',
        data: { registrationId: id, jobId: published.id, jobStatus: published.status },
      });
    } catch (error) {
      console.error('Ticket retry publish failed:', error);
      const failedJob = await getTicketGenerationJob(id);
      return NextResponse.json({
        status: 'error',
        message: 'Ticket retry failed to send',
        data: { registrationId: id, jobId: failedJob?.id || job.id, jobStatus: failedJob?.status || 'failed', retryable: true },
      }, { status: 503 });
    }
  } catch (error) {
    console.error('Retry Ticket Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
