import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('S7-T1: Dashboard Analytics Endpoints', () => {
  let adminToken: string;
  const eventIds: string[] = [];

  beforeAll(async () => {
    // Use a real Supabase Auth session because middleware validates admin tokens
    // against the configured local Auth service.
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' }),
    });
    expect(loginResponse.status).toBe(200);
    adminToken = (await loginResponse.json()).data.access_token;

    // Create 6 Events (to test '5 recent events' limit)
    for (let i = 0; i < 6; i++) {
      const [event] = await db.insert(events).values({
        name: `Analytics Event ${i}`,
        slug: `analytics-event-${Date.now()}-${i}`,
        location: 'Hall',
        date: new Date(Date.now() + i * 100000), // different dates
        capacity: 10 + i,
        registrationMode: 'Auto-Accept',
        volunteerPinHash: 'test-volunteer-pin-hash',
      }).returning();
      eventIds.push(event.id);

      // Create Registrations for the last event (eventIds[5]) specifically to test event stats
      if (i === 5) {
        // 2 Pending
        await db.insert(registrations).values([
          { eventId: event.id, name: 'P1', email: 'p1@test.com', status: 'Pending', ticketCode: `P1${Date.now().toString().slice(-6)}` },
          { eventId: event.id, name: 'P2', email: 'p2@test.com', status: 'Pending', ticketCode: `P2${Date.now().toString().slice(-6)}` }
        ]);

        // 3 Accepted, 1 of them Present
        await db.insert(registrations).values([
          { eventId: event.id, name: 'A1', email: 'a1@test.com', status: 'Accepted', ticketCode: `A1${Date.now().toString().slice(-6)}` },
          { eventId: event.id, name: 'A2', email: 'a2@test.com', status: 'Accepted', ticketCode: `A2${Date.now().toString().slice(-6)}` },
          { eventId: event.id, name: 'A3', email: 'a3@test.com', status: 'Accepted', ticketCode: `A3${Date.now().toString().slice(-6)}`, presenceStatus: 'Present' }
        ]);
      }
    }
  });

  afterAll(async () => {
    if (eventIds.length > 0) {
      await db.delete(events).where(inArray(events.id, eventIds));
    }
  });

  it('should return global dashboard stats correctly', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // Check structure and logic
    expect(data.status).toBe('success');
    expect(typeof data.data.total_events).toBe('number');
    expect(typeof data.data.total_registrations).toBe('number');
    expect(typeof data.data.total_present).toBe('number');

    // Check 5 recent events
    expect(data.data.recent_events).toBeDefined();
    expect(data.data.recent_events.length).toBeLessThanOrEqual(5);
  });

  it('should return specific event stats correctly', async () => {
    const targetEventId = eventIds[5];
    const res = await fetch(`${BASE_URL}/api/v1/events/${targetEventId}/stats`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('success');
    expect(data.data.total_capacity).toBe(15); // 10 + 5
    expect(data.data).not.toHaveProperty('capacity');
    expect(data.data.pending).toBe(2);
    expect(data.data.accepted).toBe(3);
    expect(data.data.present).toBe(1);
  });

  it('should reject non-admin access', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/dashboard`);
    expect(res.status).toBe(401);
  });
});
