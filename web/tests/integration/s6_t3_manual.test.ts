import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations, checkInSessions, checkInLogs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import * as jose from 'jose';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('S6-T3: Manual Ticket Code Input', () => {
  let eventId: string;
  let eventSlug: string;
  let sessionId: string;
  let validTicketRegId: string;
  let volunteerToken: string;

  beforeAll(async () => {
    // 1. Create Event
    eventSlug = 'manual-scan-test-' + Date.now();
    const [event] = await db.insert(events).values({
      name: 'Manual Scan Test Event',
      slug: eventSlug,
      location: 'HQ',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning();
    eventId = event.id;

    // 2. Create Check-in Session
    const [session] = await db.insert(checkInSessions).values({
      eventId: event.id,
      volunteerName: 'Manual Bot',
    }).returning();
    sessionId = session.id;

    // 3. Mint JWT for Volunteer
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
    volunteerToken = await new jose.SignJWT({ 
        role: 'volunteer',
        event_id: event.id,
        event_slug: eventSlug,
        volunteer_name: 'Manual Bot',
        session_id: sessionId
      })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);

    // 4. Create Accepted Registration
    const [validReg] = await db.insert(registrations).values({
      eventId: event.id,
      name: 'Peserta Manual',
      email: 'manual@test.com',
      status: 'Accepted',
      ticketCode: 'MANUAL12', // Exactly 8 chars, uppercase in DB
    }).returning();
    validTicketRegId = validReg.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('should normalize manual input (lowercase, spaces) and successfully check-in', async () => {
    // Send un-normalized ticket code: lowercase with surrounding spaces
    const unnormalizedCode = '   manual12  ';

    const res = await fetch(`${BASE_URL}/api/v1/checkin/scan`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volunteerToken}`
      },
      body: JSON.stringify({ 
        ticket_code: unnormalizedCode, 
        event_id: eventId,
        scan_method: 'Manual' 
      })
    });
    
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.data.ticket_code).toBe('MANUAL12'); // Must return the normalized true code

    // Verify presence status
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, validTicketRegId));
    expect(reg.presenceStatus).toBe('Present');

    // Verify Success log
    const logs = await db.select().from(checkInLogs).where(
      and(
        eq(checkInLogs.registrationId, validTicketRegId),
        eq(checkInLogs.scanMethod, 'Manual')
      )
    );
    expect(logs.length).toBe(1);
    expect(logs[0].scanStatus).toBe('Success');
    expect(logs[0].scannedTicketCode).toBe('MANUAL12'); // The log must store the normalized version
  });
});
