import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { POST } from '../../app/api/v1/registrations/[id]/review/route';
import * as qstash from '../../lib/services/qstash';

const suffix = Date.now().toString();
const slug = `bug-008-${suffix}`;
let eventId = '';
let pendingId = '';
let draftId = '';
let acceptedId = '';
let rejectedId = '';

function reviewRequest(registrationId: string) {
  return new Request(`http://localhost/api/v1/registrations/${registrationId}/review`, {
    method: 'POST',
    body: JSON.stringify({ action: 'Reject' }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('BUG-008 review state machine', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'Review State Event', slug, location: 'Jakarta', date: new Date(), capacity: 20, registrationMode: 'Manual Review', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
    const created = await db.insert(registrations).values([
      { eventId, name: 'Pending', email: `pending-${suffix}@example.test`, status: 'Pending' },
      { eventId, name: 'Draft', email: `draft-${suffix}@example.test`, status: 'Draft' },
      { eventId, name: 'Accepted', email: `accepted-${suffix}@example.test`, status: 'Accepted' },
      { eventId, name: 'Rejected', email: `rejected-${suffix}@example.test`, status: 'Rejected' },
    ]).returning({ id: registrations.id, status: registrations.status });
    pendingId = created.find((registration) => registration.status === 'Pending')!.id;
    draftId = created.find((registration) => registration.status === 'Draft')!.id;
    acceptedId = created.find((registration) => registration.status === 'Accepted')!.id;
    rejectedId = created.find((registration) => registration.status === 'Rejected')!.id;
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('rejects only Pending registrations and never publishes a reject job', async () => {
    const publishSpy = vi.spyOn(qstash, 'publishJob');
    const pendingResponse = await POST(reviewRequest(pendingId), { params: Promise.resolve({ id: pendingId }) });
    expect(pendingResponse.status).toBe(200);
    const [updatedPending] = await db.select({ status: registrations.status }).from(registrations).where(eq(registrations.id, pendingId));
    expect(updatedPending?.status).toBe('Rejected');
    expect(publishSpy).not.toHaveBeenCalled();

    for (const registrationId of [draftId, acceptedId, rejectedId]) {
      const response = await POST(reviewRequest(registrationId), { params: Promise.resolve({ id: registrationId }) });
      expect(response.status).toBe(409);
    }
    publishSpy.mockRestore();
  });
});
