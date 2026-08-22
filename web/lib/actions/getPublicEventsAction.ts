import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

/**
 * Returns the safe public projection used by the Ticket-In event directory.
 * Internal fields such as volunteerPinHash and persistence timestamps are
 * intentionally excluded from this server-side boundary.
 */
export async function getPublicEventsAction() {
  return db
    .select({
      name: events.name,
      slug: events.slug,
      description: events.description,
      location: events.location,
      date: events.date,
      posterUrl: events.posterUrl,
      capacity: events.capacity,
    })
    .from(events)
    .where(eq(events.status, 'Published'))
    .orderBy(asc(events.date));
}
