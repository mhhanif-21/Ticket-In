import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportJobs } from '@/db/schema';
import { Client } from '@upstash/qstash';

const qstashClient = new Client({ token: process.env.QSTASH_TOKEN || 'fake-token' });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  try {
    // Create job entry
    const [job] = await db.insert(exportJobs).values({
      eventId: eventId,
      status: 'pending'
    }).returning();

    // Trigger QStash
    try {
      await qstashClient.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/v1/worker/export`,
        body: {
          job_id: job.id,
          event_id: eventId
        }
      });
    } catch (qErr) {
      console.error('QStash publish error (ignored for local/test):', qErr);
    }

    return NextResponse.json({
      status: 'success',
      data: { job_id: job.id }
    });
  } catch (error) {
    console.error(`Error triggering export for event ${eventId}:`, error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
