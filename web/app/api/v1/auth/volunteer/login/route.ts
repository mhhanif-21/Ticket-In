import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';

export const runtime = 'nodejs';

// Initialize Upstash Redis & Rate Limiter
// Fallback to undefined if env vars are missing so we can catch it or mock it
let redis: Redis | undefined;
let ratelimit: Ratelimit | undefined;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  
  // Create a new ratelimiter, that allows 5 requests per 15 minutes
  ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(5, '15 m'),
    analytics: true,
  });
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // Apply Rate Limiting if configured
    if (ratelimit) {
      const { success } = await ratelimit.limit(`ratelimit_volunteer_login_${ip}`);
      if (!success) {
        return NextResponse.json(
          { status: 'error', message: 'Terlalu banyak percobaan gagal, silakan coba lagi nanti' },
          { status: 429 }
        );
      }
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
      return NextResponse.json(
        { status: 'error', message: 'PIN salah' },
        { status: 401 }
      );
    }

    // 3. Terbitkan JWT Token menggunakan jose
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
    const alg = 'HS256';

    const jwt = await new jose.SignJWT({ 
        role: 'volunteer',
        event_id: event.id,
        volunteer_name: volunteer_name
      })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);

    return NextResponse.json(
      {
        status: 'success',
        data: {
          access_token: jwt,
          role: 'volunteer',
          user: {
            volunteer_name: volunteer_name,
            event_id: event.id,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Volunteer login error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan internal server' },
      { status: 500 }
    );
  }
}
