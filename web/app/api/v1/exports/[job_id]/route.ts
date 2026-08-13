import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request, { params }: { params: Promise<{ job_id: string }> }) {
  const { job_id: jobId } = await params;
  try {
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId));

    if (!job) {
      return NextResponse.json({ status: 'error', message: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: 'success',
      data: {
        id: job.id,
        status: job.status,
        file_url: job.fileUrl,
        created_at: job.createdAt
      }
    });
  } catch (error) {
    console.error(`Error fetching job ${jobId}:`, error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
