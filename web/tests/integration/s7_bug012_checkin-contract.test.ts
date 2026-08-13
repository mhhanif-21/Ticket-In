import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { checkInSessions, events, registrations } from '../../db/schema';
import { POST } from '../../app/api/v1/checkin/scan/route';

const suffix = Date.now().toString();
let eventId = '';
let sessionId = '';
let acceptedCode = '';
let pendingCode = '';

function scanRequest(ticketCode: string) {
  return new Request('http://localhost/api/v1/checkin/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'volunteer', 'x-session-id': sessionId, 'x-event-id': eventId },
    body: JSON.stringify({ ticket_code: ticketCode }),
  });
}

describe('BUG-012 check-in response contract', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'Contract Scan Event', slug: `bug-012-${suffix}`, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
    const [session] = await db.insert(checkInSessions).values({ eventId, volunteerName: 'Contract Scanner' }).returning({ id: checkInSessions.id });
    sessionId = session.id;
    acceptedCode = `OK12${suffix.slice(-4)}`;
    pendingCode = `PN12${suffix.slice(-4)}`;
    await db.insert(registrations).values([
      { eventId, name: 'Contract Accepted', email: `accepted-${suffix}@example.test`, status: 'Accepted', ticketCode: acceptedCode },
      { eventId, name: 'Contract Pending', email: `pending-${suffix}@example.test`, status: 'Pending', ticketCode: pendingCode },
    ]);
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('returns attendance_time on success and first_scanned_at on duplicate', async () => {
    const success = await POST(scanRequest(acceptedCode));
    expect(success.status).toBe(200);
    const successBody = await success.json();
    expect(successBody).toMatchObject({ status: 'success', data: { participant_name: 'Contract Accepted', ticket_code: acceptedCode } });
    expect(typeof successBody.data.attendance_time).toBe('string');
    expect(Number.isNaN(Date.parse(successBody.data.attendance_time))).toBe(false);

    const duplicate = await POST(scanRequest(acceptedCode));
    expect(duplicate.status).toBe(409);
    const duplicateBody = await duplicate.json();
    expect(duplicateBody).toMatchObject({ status: 'error', data: { scanned_by_role: 'volunteer' } });
    expect(typeof duplicateBody.data.first_scanned_at).toBe('string');
  });

  it('returns 404 with the canonical invalid message for an unapproved ticket', async () => {
    const response = await POST(scanRequest(pendingCode));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      message: 'Tiket tidak terdaftar di sistem atau pendaftaran belum disetujui.',
    });
  });
});
