import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, checkInSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';

export const runtime = 'nodejs';

let redis: Redis | undefined;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// Fallback in-memory store for failed attempts when Redis is not available
const fallbackStore = new Map<string, { count: number, resetAt: number }>();

function getFailedAttempts(ip: string): number {
  const now = Date.now();
  const record = fallbackStore.get(ip);
  if (!record || record.resetAt < now) return 0;
  return record.count;
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const record = fallbackStore.get(ip);
  if (!record || record.resetAt < now) {
    fallbackStore.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    record.count++;
  }
}

function clearFailedAttempts(ip: string) {
  fallbackStore.delete(ip);
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const redisKey = `failed_login_${ip}`;

    // Check current failed attempts
    let failedCount = 0;
    if (redis) {
      failedCount = (await redis.get<number>(redisKey)) || 0;
    } else {
      failedCount = getFailedAttempts(ip);
    }

    if (failedCount >= 5) {
      return NextResponse.json(
        { status: 'error', message: 'Terlalu banyak percobaan gagal, silakan coba lagi nanti' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { event_slug, pin, volunteer_name } = body;

    if (!event_slug || !pin || !volunteer_name) {
      return NextResponse.json(
        { status: 'error', message: 'event_slug, pin, dan volunteer_name wajib diisi' },
        { status: 400 }
      );
    }

    // 1. Cari event berdasarkan slug
    const eventRecords = await db.select().from(events).where(eq(events.slug, event_slug)).limit(1);
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
      // Record failed attempt
      if (redis) {
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.expire(redisKey, 15 * 60);
      } else {
        recordFailedAttempt(ip);
      }

      return NextResponse.json(
        { status: 'error', message: 'PIN salah' },
        { status: 401 }
      );
    }

    // Clear failed attempts on success
    if (redis) {
      await redis.del(redisKey);
    } else {
      clearFailedAttempts(ip);
    }

    // 3. Create check-in session record
    const [sessionRecord] = await db.insert(checkInSessions).values({
      eventId: event.id,
      volunteerName: volunteer_name,
    }).returning();

    // 4. Terbitkan JWT Token menggunakan jose
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
    const alg = 'HS256';

    const jwt = await new jose.SignJWT({
        role: 'volunteer',
        event_id: event.id,
        event_slug: event.slug,
        volunteer_name: volunteer_name,
        session_id: sessionRecord.id
      })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);

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
  } catch (error: any) {
    console.error('Volunteer login error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan internal server' },
      { status: 500 }
    );
  }
}
