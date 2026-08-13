import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';

export async function getPublicEventAction(slug: string) {
  // 1. Dapatkan event berdasarkan slug
  const eventRecords = await db
    .select()
    .from(events)
    .where(eq(events.slug, slug))
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
