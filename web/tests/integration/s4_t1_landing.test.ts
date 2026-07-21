import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getPublicEventAction } from '../../lib/actions/getPublicEventAction';

let eventId = '';
let slug = 'test-landing-page-' + Date.now();

describe('S4-T1 Public Event Landing Page Action', () => {
  beforeAll(async () => {
    const [e] = await db.insert(events).values({
      name: 'Landing Page Event',
      slug,
      location: 'Online',
      date: new Date('2026-12-12'),
      capacity: 2, // Kapasitas sangat kecil untuk test isFull
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = e.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('should return null for invalid slug', async () => {
    const res = await getPublicEventAction('invalid-slug-12345');
    expect(res).toBeNull();
  });

  it('should return event and isFull=false when not full', async () => {
    const res = await getPublicEventAction(slug);
    expect(res).not.toBeNull();
    expect(res?.name).toBe('Landing Page Event');
    expect(res?.isFull).toBe(false);
    expect(res?.currentCount).toBe(0);
  });

  it('should return isFull=true when capacity is reached', async () => {
    // Insert 2 registrations to max out capacity
    await db.insert(registrations).values([
      { eventId, name: 'A', email: 'a@a.com', status: 'Accepted' as const },
      { eventId, name: 'B', email: 'b@b.com', status: 'Pending' as const },
    ]);

    const res = await getPublicEventAction(slug);
    expect(res).not.toBeNull();
    expect(res?.isFull).toBe(true);
    expect(res?.currentCount).toBe(2);
  });
});
