import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations, checkInSessions, checkInLogs } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as jose from 'jose';

const BASE_URL = 'http://localhost:3001';

describe('S6-T2: QR Ticket Scan & Validation', () => {
  let eventId: string;
  let sessionId: string;
  let validTicketRegId: string;
  let pendingTicketRegId: string;
  let volunteerToken: string;

  beforeAll(async () => {
    // 1. Create Event
    const [event] = await db.insert(events).values({
      name: 'Scan Test Event',
      slug: 'scan-test-event-' + Date.now(),
      location: 'Lab',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning();
    eventId = event.id;

    // 2. Create Check-in Session
    const [session] = await db.insert(checkInSessions).values({
      eventId: event.id,
      volunteerName: 'Scanner Bot',
    }).returning();
    sessionId = session.id;

    // 3. Mint JWT for Volunteer
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
    volunteerToken = await new jose.SignJWT({ 
        role: 'volunteer',
        event_id: event.id,
        volunteer_name: 'Scanner Bot',
        session_id: sessionId
      })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);

    // 4. Create Accepted Registration
    const [validReg] = await db.insert(registrations).values({
      eventId: event.id,
      name: 'Peserta Valid',
      email: 'valid@test.com',
      status: 'Accepted',
      ticketCode: 'VALID123',
    }).returning();
    validTicketRegId = validReg.id;

    // 5. Create Pending Registration
    const [pendingReg] = await db.insert(registrations).values({
      eventId: event.id,
      name: 'Peserta Pending',
      email: 'pending@test.com',
      status: 'Pending',
      ticketCode: 'PENDN123',
    }).returning();
    pendingTicketRegId = pendingReg.id;
  });

  afterAll(async () => {
    // Cleanup
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId)); // Cascades everything
    }
  });

  it('should reject unauthorized access (no token)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/checkin/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_code: 'VALID123', event_id: eventId })
    });
    expect(res.status).toBe(401);
  });

  it('should successfully check-in a valid, accepted ticket', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/checkin/scan`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volunteerToken}`
      },
      body: JSON.stringify({ ticket_code: 'VALID123', event_id: eventId })
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');

    // Verify presence status is updated in DB
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, validTicketRegId));
    expect(reg.presenceStatus).toBe('Present');

    // Verify Success log
    const logs = await db.select().from(checkInLogs).where(eq(checkInLogs.registrationId, validTicketRegId));
    expect(logs.length).toBe(1);
    expect(logs[0].scanStatus).toBe('Success');
    expect(logs[0].checkInSessionId).toBe(sessionId);
  });

  it('TDS-003: should reject duplicate scan and return first scan time', async () => {
    // Second scan for the same ticket
    const res = await fetch(`${BASE_URL}/api/v1/checkin/scan`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volunteerToken}`
      },
      body: JSON.stringify({ ticket_code: 'VALID123', event_id: eventId })
    });
    const data = await res.json();

    expect(res.status).toBe(409); // Conflict
    expect(data.status).toBe('error');
    expect(data.data.first_scan_time).toBeDefined();

    // Verify Duplicate log was appended
    const logs = await db.select().from(checkInLogs).where(eq(checkInLogs.registrationId, validTicketRegId));
    expect(logs.length).toBe(2);
    // Find the one that is duplicate
    const duplicateLog = logs.find(l => l.scanStatus === 'Duplicate');
    expect(duplicateLog).toBeDefined();
  });

  it('TDS-008: should reject pending registration as invalid', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/checkin/scan`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volunteerToken}`
      },
      body: JSON.stringify({ ticket_code: 'PENDN123', event_id: eventId })
    });
    
    expect(res.status).toBe(400); // Invalid request
    
    // Verify Invalid log was recorded
    const logs = await db.select().from(checkInLogs).where(eq(checkInLogs.registrationId, pendingTicketRegId));
    expect(logs.length).toBe(1);
    expect(logs[0].scanStatus).toBe('Invalid');
  });
});
