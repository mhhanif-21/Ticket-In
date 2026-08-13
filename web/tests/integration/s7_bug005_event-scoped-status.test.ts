import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { GET } from '../../app/api/v1/registration/status/route';

const suffix = Date.now().toString();
const slugA = `bug-005-a-${suffix}`;
const slugB = `bug-005-b-${suffix}`;
let eventIds: string[] = [];

describe('BUG-005 event-scoped registration status', () => {
  beforeAll(async () => {
    const created = await db.insert(events).values([
      { name: 'Event A', slug: slugA, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' },
      { name: 'Event B', slug: slugB, location: 'Bandung', date: new Date(), capacity: 10, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' },
    ]).returning({ id: events.id });
    eventIds = created.map((event) => event.id);
    await db.insert(registrations).values([
      { eventId: eventIds[0], name: 'Same Person', email: 'same@example.test', status: 'Accepted', ticketCode: 'A50005A' },
      { eventId: eventIds[1], name: 'Same Person', email: 'same@example.test', status: 'Pending' },
    ]);
  });

  afterAll(async () => {
    if (eventIds.length) await db.delete(events).where(inArray(events.id, eventIds));
  });

  it('returns only the matching event registration for identical participant details', async () => {
    const responseA = await GET(new Request(`http://localhost/api/v1/registration/status?event_slug=${slugA}&name=Same%20Person&email=same%40example.test`));
    const responseB = await GET(new Request(`http://localhost/api/v1/registration/status?event_slug=${slugB}&name=Same%20Person&email=same%40example.test`));

    expect(responseA.status).toBe(200);
    expect((await responseA.json()).data).toMatchObject({ status: 'Accepted', ticket_code: 'A50005A' });
    expect(responseB.status).toBe(200);
    expect((await responseB.json()).data).toMatchObject({ status: 'Pending', ticket_code: null });
  });

  it('requires event scope and preserves the generic not-found boundary', async () => {
    expect((await GET(new Request('http://localhost/api/v1/registration/status?name=Same%20Person&email=same%40example.test'))).status).toBe(400);
    expect((await GET(new Request('http://localhost/api/v1/registration/status?event_slug=not-an-event&name=Same%20Person&email=same%40example.test'))).status).toBe(404);
  });
});
