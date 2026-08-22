import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/db';
import { registrations, events } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getClientIp } from '@/lib/security/ip';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

const MAX_LOOKUP_REQUESTS_PER_MINUTE = 15;
const MAX_LOOKUP_REQUESTS_PER_EVENT_PER_MINUTE = 60;
const LOOKUP_WINDOW_SECONDS = 60;

function eventRateLimitKey(eventSlug: string): string {
  const digest = createHash('sha256').update(eventSlug).digest('hex').slice(0, 32);
  return `status_lookup_event_${digest}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const email = searchParams.get('email');
    const eventSlug = searchParams.get('event_slug');
    const ip = getClientIp(request);
    const rateLimitKey = `status_lookup_ip_${ip}`;

    const rateLimit = await checkRateLimit(
      rateLimitKey,
      MAX_LOOKUP_REQUESTS_PER_MINUTE,
      LOOKUP_WINDOW_SECONDS
    );

    if (rateLimit.storageUnavailable) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Layanan pengecekan tiket sementara tidak tersedia.',
        },
        { status: 503 }
      );
    }

    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          status: 'error',
          message: 'Terlalu banyak permintaan pengecekan status tiket, silakan coba lagi beberapa saat lagi.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    if (eventSlug?.trim()) {
      const eventRateLimit = await checkRateLimit(
        eventRateLimitKey(eventSlug.trim().toLowerCase()),
        MAX_LOOKUP_REQUESTS_PER_EVENT_PER_MINUTE,
        LOOKUP_WINDOW_SECONDS
      );

      if (eventRateLimit.storageUnavailable) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Layanan pengecekan tiket sementara tidak tersedia.',
          },
          { status: 503 }
        );
      }

      if (!eventRateLimit.allowed) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((eventRateLimit.resetAt - Date.now()) / 1000)
        );
        return NextResponse.json(
          {
            status: 'error',
            message: 'Terlalu banyak permintaan pengecekan untuk event ini, silakan coba lagi beberapa saat lagi.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfterSeconds),
            },
          }
        );
      }
    }

    if (!name || !email || !eventSlug) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter event_slug, name, dan email wajib diisi' },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, eventSlug.trim()))
      .limit(1);

    // TDS-010: use the same not-found response for an unknown event and participant.
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    const regRecords = await db
      .select({
        status: registrations.status,
        ticketCode: registrations.ticketCode,
        qrCodeUrl: registrations.qrCodeUrl,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, event.id),
          sql`lower(${registrations.name}) = lower(${cleanName})`,
          sql`lower(${registrations.email}) = lower(${cleanEmail})`
        )
      )
      .limit(1);

    if (regRecords.length === 0) {
      // TDS-010: Return 404 without leaking info
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    const reg = regRecords[0];

    // Data minimization: Return only essential fields required by UI, omitting email and unnecessary PII
    return NextResponse.json(
      {
        status: 'success',
        message: 'Tiket berhasil ditemukan',
        data: {
          status: reg.status,
          ticket_code: reg.ticketCode,
          qr_code_url: reg.qrCodeUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in check status API:', error);
    return NextResponse.json({ status: 'error', message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
