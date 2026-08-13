import { describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');

async function createVolunteerToken(eventSlug: string) {
  return new jose.SignJWT({
    role: 'volunteer',
    event_id: '11111111-1111-4111-8111-111111111111',
    event_slug: eventSlug,
    session_id: '22222222-2222-4222-8222-222222222222',
    volunteer_name: 'Panitia Test',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

describe('BUG-018: scanner route protection', () => {
  it('redirects a visitor without a volunteer session to the event login page', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3001/acara-keren/checkin/scan')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3001/acara-keren/checkin');
  });

  it('redirects a volunteer token that belongs to a different event', async () => {
    const token = await createVolunteerToken('acara-lain');
    const response = await middleware(
      new NextRequest('http://localhost:3001/acara-keren/checkin/scan', {
        headers: { cookie: `volunteer_token=${token}` },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3001/acara-keren/checkin');
  });

  it('allows a valid volunteer token for the matching event', async () => {
    const token = await createVolunteerToken('acara-keren');
    const response = await middleware(
      new NextRequest('http://localhost:3001/acara-keren/checkin/scan', {
        headers: { cookie: `volunteer_token=${token}` },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
