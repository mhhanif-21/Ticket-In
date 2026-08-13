import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';
import { getPublicEventsAction } from '../../lib/actions/getPublicEventsAction';

const suffix = Date.now().toString();
const eventSlugs = [`ticket-in-catalog-a-${suffix}`, `ticket-in-catalog-b-${suffix}`];

describe('Ticket-In root event catalog', () => {
  beforeAll(async () => {
    await db.insert(events).values([
      {
        name: 'Ticket-In Catalog A',
        slug: eventSlugs[0],
        description: 'Public catalog event A',
        location: 'Jakarta',
        date: new Date('2026-09-01T09:00:00.000Z'),
        capacity: 100,
        registrationMode: 'Auto-Accept',
        volunteerPinHash: 'internal-only-a',
      },
      {
        name: 'Ticket-In Catalog B',
        slug: eventSlugs[1],
        description: 'Public catalog event B',
        location: 'Bandung',
        date: new Date('2026-10-01T09:00:00.000Z'),
        capacity: 200,
        registrationMode: 'Manual Review',
        volunteerPinHash: 'internal-only-b',
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(events).where(inArray(events.slug, eventSlugs));
  });

  it('returns public event cards ordered by date without internal fields', async () => {
    const catalog = await getPublicEventsAction();
    const selected = catalog.filter((event) => eventSlugs.includes(event.slug));

    expect(selected.map((event) => event.slug)).toEqual(eventSlugs);
    expect(selected[0]).toMatchObject({
      name: 'Ticket-In Catalog A',
      slug: eventSlugs[0],
      location: 'Jakarta',
    });
    expect(selected[0]).not.toHaveProperty('volunteerPinHash');
    expect(selected[0]).not.toHaveProperty('createdAt');
    expect(selected[0]).not.toHaveProperty('updatedAt');
  });
});
