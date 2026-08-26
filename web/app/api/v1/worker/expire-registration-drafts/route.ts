import { NextRequest, NextResponse } from 'next/server';

import { expireStaleDraftRegistrations } from '@/lib/registration/draftLifecycle';
import { isAuthorizedCronRequest } from '@/lib/security/cron';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  const expired = await expireStaleDraftRegistrations();
  return NextResponse.json({ status: 'success', data: { expired } });
}
