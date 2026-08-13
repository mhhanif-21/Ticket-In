import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import * as jose from 'jose';

const manualPageSource = readFileSync(new URL('../../app/[slug]/checkin/manual/page.tsx', import.meta.url), 'utf8');
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');

async function volunteerToken(eventSlug: string) {
  return new jose.SignJWT({ role: 'volunteer', event_id: '11111111-1111-4111-8111-111111111111', event_slug: eventSlug, session_id: '22222222-2222-4222-8222-222222222222', volunteer_name: 'Manual Test' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret);
}

describe('BUG-011 manual scanner cookie session boundary', () => {
  it('protects manual scanner with the same HttpOnly-cookie middleware as camera scanner', async () => {
    const unauthenticated = await middleware(new NextRequest('http://localhost/acara-keren/checkin/manual'));
    expect(unauthenticated.status).toBe(307);
    expect(unauthenticated.headers.get('location')).toBe('http://localhost/acara-keren/checkin');

    const token = await volunteerToken('acara-keren');
    const authenticated = await middleware(new NextRequest('http://localhost/acara-keren/checkin/manual', { headers: { cookie: `volunteer_token=${token}` } }));
    expect(authenticated.status).toBe(200);
  });

  it('does not read or send a volunteer token through LocalStorage/manual Authorization', () => {
    expect(manualPageSource).not.toContain('localStorage');
    expect(manualPageSource).not.toContain('Authorization');
    expect(manualPageSource).toContain("credentials: 'same-origin'");
  });
});
