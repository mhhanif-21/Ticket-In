import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, checkInSessions } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';

// Define the environment variables needed for jose if not set
process.env.JWT_SECRET = 'test-secret';

describe('S6-T1: Check-in Session Entry', () => {
  let testEvent: any;
  let testEventId: string;
  const pin = '123456';
  
  beforeAll(async () => {
    // Setup test event with known PIN
    const hashedPin = await bcrypt.hash(pin, 10);
    const newEvents = await db.insert(events).values({
      name: 'Test Event Checkin S6',
      slug: 'test-event-checkin-s6',
      description: 'Test Event',
      location: 'Online',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: hashedPin
    }).returning();
    testEvent = newEvents[0];
    testEventId = testEvent.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(events).where(eq(events.id, testEventId));
  });

  it('should successfully login and create a check-in session', async () => {
    const res = await fetch('http://localhost:3001/api/v1/auth/volunteer/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_slug: 'test-event-checkin-s6',
        pin: '123456',
        volunteer_name: 'Budi Test'
      })
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.data.access_token).toBeDefined();
    expect(data.data.user.session_id).toBeDefined();

    const sessionId = data.data.user.session_id;

    // Verify session in database
    const sessions = await db.select().from(checkInSessions).where(eq(checkInSessions.id, sessionId));
    expect(sessions.length).toBe(1);
    expect(sessions[0].volunteerName).toBe('Budi Test');
    expect(sessions[0].eventId).toBe(testEventId);

    // Verify token payload
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(data.data.access_token, secret);
    expect(payload.session_id).toBe(sessionId);
    expect(payload.role).toBe('volunteer');
    expect(payload.event_id).toBe(testEventId);
  });

  it('should handle multiple concurrent logins creating separate sessions', async () => {
    const req1 = fetch('http://localhost:3001/api/v1/auth/volunteer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_slug: 'test-event-checkin-s6', pin: '123456', volunteer_name: 'Panitia A' })
    });
    
    const req2 = fetch('http://localhost:3001/api/v1/auth/volunteer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_slug: 'test-event-checkin-s6', pin: '123456', volunteer_name: 'Panitia B' })
    });

    // Run concurrently
    const [res1, res2] = await Promise.all([req1, req2]);
    
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const data1 = await res1.json();
    const data2 = await res2.json();

    const sessionId1 = data1.data.user.session_id;
    const sessionId2 = data2.data.user.session_id;

    expect(sessionId1).toBeDefined();
    expect(sessionId2).toBeDefined();
    expect(sessionId1).not.toBe(sessionId2); // Must be different sessions

    const sessions1 = await db.select().from(checkInSessions).where(eq(checkInSessions.id, sessionId1));
    const sessions2 = await db.select().from(checkInSessions).where(eq(checkInSessions.id, sessionId2));

    expect(sessions1[0].volunteerName).toBe('Panitia A');
    expect(sessions2[0].volunteerName).toBe('Panitia B');
  });
});
