import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { checkInLogs, checkInSessions, events, registrations } from '../../db/schema';
import { POST } from '../../app/api/v1/checkin/scan/route';

const suffix = Date.now().toString();
let eventId = '';
let registrationId = '';
let sessionIds: string[] = [];

function scanRequest(sessionId: string) {
  return new Request('http://localhost/api/v1/checkin/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'volunteer', 'x-session-id': sessionId, 'x-event-id': eventId },
    body: JSON.stringify({ ticket_code: 'RACE010' }),
  });
}

describe('BUG-010 concurrent check-in', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'Concurrent Scan Event', slug: `bug-010-${suffix}`, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
    const sessions = await db.insert(checkInSessions).values([
      { eventId, volunteerName: 'Scanner A' },
      { eventId, volunteerName: 'Scanner B' },
    ]).returning({ id: checkInSessions.id });
    sessionIds = sessions.map((session) => session.id);
    const [registration] = await db.insert(registrations).values({ eventId, name: 'Race User', email: `race-${suffix}@example.test`, status: 'Accepted', ticketCode: 'RACE010' }).returning({ id: registrations.id });
    registrationId = registration.id;
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('produces exactly one Success and one Duplicate for two simultaneous scans', async () => {
    const responses = await Promise.all(sessionIds.map((sessionId) => POST(scanRequest(sessionId))));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);

    const [registration] = await db.select().from(registrations).where(eq(registrations.id, registrationId));
    expect(registration.presenceStatus).toBe('Present');
    const logs = await db.select().from(checkInLogs).where(and(eq(checkInLogs.registrationId, registrationId), eq(checkInLogs.scannedTicketCode, 'RACE010')));
    expect(logs.filter((log) => log.scanStatus === 'Success')).toHaveLength(1);
    expect(logs.filter((log) => log.scanStatus === 'Duplicate')).toHaveLength(1);
  });
});
