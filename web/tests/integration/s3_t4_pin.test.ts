import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let adminToken = '';
let eventId = '';
let eventSlug = '';
let firstPin = '';
let secondPin = '';

describe('S3-T4 Volunteer Access API', () => {
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
        name: 'Event PIN Test',
        capacity: 50,
        location: 'Test Location',
        date: '2026-12-12T09:00:00Z',
      })
    });
    const bodyEv = await resEv.json();
    eventId = bodyEv.data[0]?.id || bodyEv.data.id;
    eventSlug = bodyEv.data[0]?.slug || bodyEv.data.slug;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('should generate PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/generate-pin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    firstPin = body.data.pin;
    expect(firstPin.length).toBe(6);
  });

  it('should allow volunteer login with valid PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_slug: eventSlug,
        pin: firstPin,
        volunteer_name: 'Test Volunteer'
      })
    });
    expect(res.status).toBe(200);
  });

  it('should rotate PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/generate-pin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const body = await res.json();
    secondPin = body.data.pin;
    expect(secondPin).toBeDefined();
    expect(secondPin).not.toBe(firstPin);
  });

  it('should reject login with old PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_slug: eventSlug,
        pin: firstPin,
        volunteer_name: 'Test Volunteer'
      })
    });
    expect(res.status).toBe(401);
  });

  it('should allow login with new PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_slug: eventSlug,
        pin: secondPin,
        volunteer_name: 'Test Volunteer'
      })
    });
    expect(res.status).toBe(200);
  });
});
