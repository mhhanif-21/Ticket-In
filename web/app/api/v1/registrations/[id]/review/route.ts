import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  ensureTicketGenerationJobTx,
  getTicketGenerationJob,
  publishTicketGenerationJob,
} from '@/lib/actions/ticketGenerationJob';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action !== 'Approve' && action !== 'Reject') {
      return NextResponse.json({ status: 'error', message: 'Invalid action. Use Approve or Reject.' }, { status: 400 });
    }

    if (action === 'Reject') {
      const rejection = await db.update(registrations)
        .set({ status: 'Rejected' })
        .where(and(eq(registrations.id, id), eq(registrations.status, 'Pending')))
        .returning({ id: registrations.id });

      if (rejection.length === 0) {
        return NextResponse.json({ status: 'error', message: 'Registration not found or not Pending' }, { status: 409 });
      }

      return NextResponse.json({ status: 'success', message: 'Registration rejected' });
    }

    if (action === 'Approve') {
      const transition = await db.transaction(async (tx) => {
        // Review actions are strict state transitions. A second Approve is not
        // a ticket retry and must not republish the worker job.
        const [updated] = await tx.update(registrations)
          .set({ status: 'Accepted' })
          .where(and(eq(registrations.id, id), eq(registrations.status, 'Pending')))
          .returning({ id: registrations.id });

        if (!updated) return null;

        // The acceptance transition and durable job creation commit together.
        const job = await ensureTicketGenerationJobTx(tx, id);
        return { jobId: job.id, jobStatus: job.status };
      });

      if (!transition) {
        return NextResponse.json({
          status: 'error',
          message: 'Registration not found or not Pending. Final status cannot be changed.',
        }, { status: 409 });
      }

      try {
        const job = await publishTicketGenerationJob(id);
        return NextResponse.json({
          status: 'success',
          message: 'Registration approved',
          data: { registrationId: id, jobId: job.id, jobStatus: job.status },
        });
      } catch (publishError) {
        console.error('Review ticket publish failed:', publishError);
        const job = await getTicketGenerationJob(id);
        return NextResponse.json({
          status: 'error',
          message: 'Registration accepted, but ticket generation job failed to send and can be retried.',
          data: { registrationId: id, jobId: job?.id || transition.jobId, jobStatus: job?.status || 'failed', retryable: true },
        }, { status: 503 });
      }
    }

    return NextResponse.json({ status: 'error', message: 'Invalid action.' }, { status: 400 });

  } catch (error) {
    console.error('Review Registration Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
