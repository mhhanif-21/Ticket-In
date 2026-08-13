import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let adminToken = '';
let eventId = '';

describe('S3-T2 Dynamic Form Builder', () => {
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
        name: 'Event for T2',
        capacity: 100,
        location: 'Test',
        date: '2026-10-10T09:00:00Z',
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

  it('should reject 26 fields', async () => {
    const fields = Array.from({ length: 26 }).map((_, i) => ({
      fieldName: `Field ${i}`, fieldType: 'text', isRequired: false, options: null, order: i
    }));
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ fields })
    });
    expect(res.status).toBe(422);
  });

  it('should accept 25 fields', async () => {
    const fields = Array.from({ length: 25 }).map((_, i) => ({
      fieldName: `Field Valid ${i}`, fieldType: i === 0 ? 'image' : 'text', isRequired: false, options: null, order: i
    }));
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ fields })
    });
    expect(res.status).toBe(200);
  });

  it('should get event fields', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const body = await res.json();
    expect(body.data.formFields.length).toBe(25);
  });

  it('should update and replace fields', async () => {
    const fields = [
      { fieldName: 'Nama Lengkap', fieldType: 'text', isRequired: true, options: null, order: 1 },
      { fieldName: 'Umur', fieldType: 'number', isRequired: false, options: null, order: 2 }
    ];
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ fields })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const getBody = await getRes.json();
    expect(getBody.data.formFields.length).toBe(2);
  });
});
