import { NextResponse } from 'next/server';
import { createExportJob, publishExportJob } from '@/lib/actions/exportJob';
import { getCanonicalBaseUrl } from '@/lib/security/url';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  try {
    if (!await getAuthenticatedAdmin(request)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
    // In production this throws when no canonical URL is configured instead
    // of publishing a webhook to an untrusted Host header.
    const workerUrl = `${getCanonicalBaseUrl(request)}/api/v1/worker/export`;
    const job = await createExportJob(eventId);
    try {
      const published = await publishExportJob(job, workerUrl);
      return NextResponse.json({
        status: 'success',
        data: { job_id: published.id, status: published.status },
      });
    } catch (qErr) {
      console.error(`QStash publish failed for export job ${job.id}:`, qErr);
      return NextResponse.json({
        status: 'error',
        message: 'Export job gagal dikirim ke worker dan dapat dicoba ulang.',
        data: { job_id: job.id, status: 'failed', retryable: true },
      }, { status: 503 });
    }
  } catch (error) {
    console.error(`Error triggering export for event ${eventId}:`, error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
