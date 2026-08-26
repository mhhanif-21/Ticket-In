import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { reconcileParticipantFileUploads } from '@/lib/registration/participantFileLifecycle';

export const runtime = 'nodejs';

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') ?? '';
  if (!secret || !authorization.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  const result = await reconcileParticipantFileUploads(20);
  return NextResponse.json({ status: 'success', data: result });
}
