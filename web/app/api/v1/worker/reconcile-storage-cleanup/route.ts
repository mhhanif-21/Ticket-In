import { NextRequest, NextResponse } from 'next/server';

import { reconcileStorageCleanupJobs } from '@/lib/storage/cleanupLifecycle';
import { isAuthorizedCronRequest } from '@/lib/security/cron';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  const result = await reconcileStorageCleanupJobs(20);
  return NextResponse.json({ status: 'success', data: result });
}
