import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { registrations, ticketGenerationJobs } from '@/db/schema';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

export const runtime = 'nodejs';

/**
 * Read the complete participant record for the admin detail screen.
 *
 * The participant list is intentionally paginated and is not a durable
 * detail-data transport. The detail route is keyed by registration ID so a
 * router refresh cannot turn an Accepted/Rejected participant into a blank
 * screen merely because GoRouter dropped its transient `extra` value.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthenticatedAdmin(request)) {
    return NextResponse.json(
      { status: 'error', code: 'PARTICIPANT_DETAIL_ACCESS_DENIED', message: 'Unauthorized' },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const [data] = await db
      .select({
        id: registrations.id,
        eventId: registrations.eventId,
        name: registrations.name,
        email: registrations.email,
        answers: registrations.answers,
        answerFieldLabels: registrations.answerFieldLabels,
        status: registrations.status,
        ticketCode: registrations.ticketCode,
        qrCodeUrl: registrations.qrCodeUrl,
        presenceStatus: registrations.presenceStatus,
        createdAt: registrations.createdAt,
        updatedAt: registrations.updatedAt,
        ticketJobStatus: ticketGenerationJobs.status,
        ticketJobLastError: ticketGenerationJobs.lastError,
      })
      .from(registrations)
      .leftJoin(ticketGenerationJobs, eq(ticketGenerationJobs.registrationId, registrations.id))
      .where(eq(registrations.id, id))
      .limit(1);

    if (!data) {
      return NextResponse.json(
        { status: 'error', code: 'PARTICIPANT_NOT_FOUND', message: 'Pendaftar tidak ditemukan.' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { status: 'success', data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Participant detail read failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { status: 'error', code: 'PARTICIPANT_DETAIL_READ_FAILED', message: 'Detail pendaftar belum dapat dimuat.' },
      { status: 500 },
    );
  }
}
