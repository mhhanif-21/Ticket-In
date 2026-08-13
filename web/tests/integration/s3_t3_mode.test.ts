import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let adminToken = '';
let eventId = '';

describe('S3-T3 Registration Mode Toggle', () => {
  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' })
    });
    const body = await res.json();
    adminToken = body.data.access_token;

    const resEv = await fetch(`${BASE_URL}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Event for T3',
        capacity: 100,
        location: 'Test',
        date: '2026-10-10T09:00:00Z',
        registration_mode: 'Auto-Accept'
      })
    });
    const bodyEv = await resEv.json();
    eventId = bodyEv.data[0]?.id || bodyEv.data.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('should reject invalid mode', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ registration_mode: 'RandomMode' })
    });
    expect(res.status).toBe(400);
  });

  it('should allow valid mode update', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ registration_mode: 'Manual Review' })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const getBody = await getRes.json();
    expect(getBody.data.registrationMode).toBe('Manual Review');
  });
});
