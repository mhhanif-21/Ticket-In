import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, checkInSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getClientIp } from '@/lib/security/ip';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rateLimit';
import { signVolunteerToken } from '@/lib/security/jwt';

export const runtime = 'nodejs';

const MAX_IP_ATTEMPTS = 5;
const MAX_EVENT_ATTEMPTS = 20;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 minutes

function rateLimitResponse(message: string, resetAt: number): NextResponse {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt - Date.now()) / 1000)
  );

  return NextResponse.json(
    { status: 'error', message },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }
  );
}

function storageUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      status: 'error',
      message: 'Layanan login sementara tidak tersedia.',
    },
    { status: 503 }
  );
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const body = await req.json();
    const { event_slug, pin, volunteer_name } = body;

    if (!event_slug || !pin || !volunteer_name) {
      return NextResponse.json(
        { status: 'error', message: 'event_slug, pin, dan volunteer_name wajib diisi' },
        { status: 400 }
      );
    }

    const normalizedEventSlug = event_slug.trim();
    const ipRateLimitKey = `volunteer_login_ip_${ip}`;
    const eventRateLimitKey = `volunteer_login_event_${normalizedEventSlug.toLowerCase()}`;

    // Increment before any database or bcrypt work so concurrent requests
    // cannot all pass a read-then-write check.
    const ipRateLimit = await checkRateLimit(
      ipRateLimitKey,
      MAX_IP_ATTEMPTS,
      LOCKOUT_WINDOW_SECONDS
    );
    if (ipRateLimit.storageUnavailable) {
      return storageUnavailableResponse();
    }
    if (!ipRateLimit.allowed) {
      return rateLimitResponse(
        'Terlalu banyak percobaan login dari sumber ini, silakan coba lagi nanti',
        ipRateLimit.resetAt
      );
    }

    const eventRateLimit = await checkRateLimit(
      eventRateLimitKey,
      MAX_EVENT_ATTEMPTS,
      LOCKOUT_WINDOW_SECONDS
    );
    if (eventRateLimit.storageUnavailable) {
      return storageUnavailableResponse();
    }
    if (!eventRateLimit.allowed) {
      return rateLimitResponse(
        'Terlalu banyak percobaan login untuk event ini, silakan coba lagi nanti',
        eventRateLimit.resetAt
      );
    }

    // 1. Cari event berdasarkan slug
    const eventRecords = await db
      .select()
      .from(events)
      .where(eq(events.slug, normalizedEventSlug))
      .limit(1);
    const event = eventRecords[0];

    if (!event) {
      return NextResponse.json(
        { status: 'error', message: 'Event tidak ditemukan' },
        { status: 404 }
      );
    }

    // 2. Validasi PIN
    const isPinValid = await bcrypt.compare(pin, event.volunteerPinHash);

    if (!isPinValid) {
      return NextResponse.json(
        { status: 'error', message: 'PIN salah' },
        { status: 401 }
      );
    }

    // Clear failed attempts on success for both IP and Event
    await resetRateLimit(ipRateLimitKey);
    await resetRateLimit(eventRateLimitKey);

    // 3. Create check-in session record
    const [sessionRecord] = await db
      .insert(checkInSessions)
      .values({
        eventId: event.id,
        volunteerName: volunteer_name,
      })
      .returning();

    // 4. Terbitkan JWT Token menggunakan modul security
    const jwt = await signVolunteerToken({
      event_id: event.id,
      event_slug: event.slug,
      volunteer_name: volunteer_name,
      session_id: sessionRecord.id,
    });

    const response = NextResponse.json(
      {
        status: 'success',
        data: {
          access_token: jwt,
          role: 'volunteer',
          user: {
            volunteer_name: volunteer_name,
            event_id: event.id,
            session_id: sessionRecord.id,
          },
        },
      },
      { status: 200 }
    );

    response.cookies.set('volunteer_token', jwt, {
      httpOnly: true,
      maxAge: 12 * 60 * 60,
      path: '/',
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch {
    console.error('Volunteer login error');
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan internal server' },
      { status: 500 }
    );
  }
}
