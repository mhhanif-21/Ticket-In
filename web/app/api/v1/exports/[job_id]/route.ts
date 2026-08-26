import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';
import { EXPORT_STORAGE_BUCKET } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request, { params }: { params: Promise<{ job_id: string }> }) {
  const { job_id: jobId } = await params;
  try {
    if (!await getAuthenticatedAdmin(request)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId));

    if (!job) {
      return NextResponse.json({ status: 'error', message: 'Job not found' }, { status: 404 });
    }

    let fileUrl: string | null = null;
    if (job.status === 'completed' && job.storagePath) {
      const { data, error } = await supabaseAdmin.storage
        .from(EXPORT_STORAGE_BUCKET)
        .createSignedUrl(job.storagePath, 5 * 60);
      if (error || !data?.signedUrl) {
        console.error('Export signed URL failed', { jobId, code: error?.statusCode });
        return NextResponse.json({ status: 'error', message: 'File export belum dapat diakses' }, { status: 503 });
      }
      fileUrl = data.signedUrl;
    }

    return NextResponse.json({
      status: 'success',
      data: {
        id: job.id,
        status: job.status,
        file_url: fileUrl,
        error: job.lastError,
        retryable: job.status === 'failed',
        attempts: job.attempts,
        created_at: job.createdAt,
        updated_at: job.updatedAt,
      }
    });
  } catch (error) {
    console.error(`Error fetching job ${jobId}:`, error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
