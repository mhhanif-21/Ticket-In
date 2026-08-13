import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db';
import { checkInLogs, checkInSessions, events, registrations } from '../../db/schema';
import { GET as getDashboard } from '../../app/api/v1/admin/dashboard/route';
import { GET as getEventStats } from '../../app/api/v1/events/[id]/stats/route';

const suffix = Date.now().toString();
let eventId = '';
let sessionId = '';

describe('BUG-013/014/015 dashboard and event stats contract', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'Dashboard Contract Event', slug: `bug-013-${suffix}`, location: 'Jakarta', date: new Date(), capacity: 50, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
    const [session] = await db.insert(checkInSessions).values({ eventId, volunteerName: 'Dashboard Test' }).returning({ id: checkInSessions.id });
    sessionId = session.id;
    const [present] = await db.insert(registrations).values({ eventId, name: 'Present', email: `present-${suffix}@example.test`, status: 'Accepted', presenceStatus: 'Present', ticketCode: `P13${suffix.slice(-5)}` }).returning({ id: registrations.id });
    await db.insert(registrations).values({ eventId, name: 'Absent', email: `absent-${suffix}@example.test`, status: 'Accepted', presenceStatus: 'Absent', ticketCode: `A13${suffix.slice(-5)}` });
    await db.insert(checkInLogs).values([
      { checkInSessionId: sessionId, registrationId: present.id, scannedTicketCode: `P13${suffix.slice(-5)}`, scanMethod: 'Camera', scanStatus: 'Invalid' },
      { checkInSessionId: sessionId, registrationId: present.id, scannedTicketCode: `P13${suffix.slice(-5)}`, scanMethod: 'Camera', scanStatus: 'Duplicate' },
    ]);
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('counts present registrations instead of check-in log rows', async () => {
    const [{ value: expectedPresent }] = await db.select({ value: count() }).from(registrations).where(eq(registrations.presenceStatus, 'Present'));
    const response = await getDashboard(new Request('http://localhost/api/v1/admin/dashboard'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.data.total_present).toBe(expectedPresent);
  });

  it('returns total_capacity and reflects capacity changes without a two-hour cache', async () => {
    const first = await getEventStats(new Request('http://localhost/api/v1/events/stats'), { params: Promise.resolve({ id: eventId }) });
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const firstBody = await first.json();
    expect(firstBody.data).toMatchObject({ total_capacity: 50, pending: 0, accepted: 2, present: 1 });
    expect(firstBody.data).not.toHaveProperty('capacity');

    await db.update(events).set({ capacity: 75 }).where(eq(events.id, eventId));
    const second = await getEventStats(new Request('http://localhost/api/v1/events/stats'), { params: Promise.resolve({ id: eventId }) });
    expect((await second.json()).data.total_capacity).toBe(75);
  });
});
