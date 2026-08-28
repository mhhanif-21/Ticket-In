import { db } from '../../db';
import { eventMedia, events, registrations } from '../../db/schema';
import { eq, and, inArray, count, asc } from 'drizzle-orm';

export type PublicEventMediaRecord = {
  role: string;
  displayOrder: number;
  publicUrl: string;
};

export function orderPublicEventMedia(
  media: PublicEventMediaRecord[],
  legacyPosterUrl?: string | null,
): PublicEventMediaRecord[] {
  const orderedMedia = [...media].sort((left, right) => {
    const roleOrder = (role: string) => role === 'cover' ? 0 : role === 'gallery' ? 1 : 2;
    return roleOrder(left.role) - roleOrder(right.role)
      || left.displayOrder - right.displayOrder;
  });
  if (!orderedMedia.some((item) => item.role === 'cover') && legacyPosterUrl?.trim()) {
    orderedMedia.unshift({
      role: 'cover',
      displayOrder: 0,
      publicUrl: legacyPosterUrl,
    });
  }
  return orderedMedia;
}

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

  const media = await db
    .select({
      role: eventMedia.role,
      displayOrder: eventMedia.displayOrder,
      publicUrl: eventMedia.publicUrl,
    })
    .from(eventMedia)
    .where(eq(eventMedia.eventId, event.id))
    .orderBy(asc(eventMedia.role), asc(eventMedia.displayOrder));

  // The cover is always the first public slide. Keep the legacy poster URL as
  // a fallback for events created before event_media was introduced.
  const orderedMedia = orderPublicEventMedia(media, event.posterUrl);

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
    media: orderedMedia,
    currentCount,
    isFull,
  };
}
