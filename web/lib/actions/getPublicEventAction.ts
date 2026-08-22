import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';

export async function getPublicEventAction(slug: string) {
  // 1. Dapatkan event berdasarkan slug
  const eventRecords = await db
    .select({
      id: events.id,
      name: events.name,
      slug: events.slug,
      description: events.description,
      location: events.location,
      date: events.date,
      posterUrl: events.posterUrl,
      capacity: events.capacity,
      registrationMode: events.registrationMode,
      status: events.status,
    })
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, 'Published')))
    .limit(1);

  if (eventRecords.length === 0) {
    return null; // Return null agar halaman Next.js bisa memanggil notFound()
  }

  const event = eventRecords[0];

  // 2. Hitung jumlah pendaftar
  const countResult = await db
    .select({ count: count() })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, event.id),
        inArray(registrations.status, ['Draft', 'Pending', 'Accepted'])
      )
    );

  const currentCount = countResult[0].count;
  const isFull = currentCount >= event.capacity;

  return {
    ...event,
    currentCount,
    isFull,
  };
}
