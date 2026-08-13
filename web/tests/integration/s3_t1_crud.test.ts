import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let adminToken = '';
let createdEventId = '';

describe('S3-T1 CRUD Event API', () => {
  afterAll(async () => {
    if (createdEventId) {
      await db.delete(events).where(eq(events.id, createdEventId));
    }
  });

  it('should login admin', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' })
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    adminToken = body.data.access_token;
    expect(adminToken).toBeDefined();
  });

  it('should create an event', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Test Event ' + Date.now(),
        capacity: 100,
        location: 'Jakarta',
        date: '2026-10-10T09:00:00Z',
        description: 'Ini adalah event test'
      })
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    createdEventId = body.data[0]?.id || body.data.id;
    expect(createdEventId).toBeDefined();
  });

  it('should list events', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should get event detail', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${createdEventId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data.name).toBeDefined();
  });

  it('should update an event', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${createdEventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ capacity: 200 })
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data[0]?.capacity || body.data.capacity).toBe(200);
  });
});
