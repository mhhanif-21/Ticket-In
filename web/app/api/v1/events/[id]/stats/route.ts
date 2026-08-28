import { NextResponse } from 'next/server';
import { db } from '@/db';
import { eventMedia, events, registrations } from '@/db/schema';
import { eq, and, asc, count } from 'drizzle-orm';

// Statistics are operational data and must not be served from a two-hour snapshot.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await props.params;
  try {
    // Fetch event details and capacity
    const eventResult = await db.select({
      capacity: events.capacity,
      name: events.name,
      description: events.description,
      location: events.location,
      date: events.date,
      posterUrl: events.posterUrl,
      posterAspectMode: events.posterAspectMode,
      registrationMode: events.registrationMode,
      status: events.status,
    })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (eventResult.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Event not found' }, { status: 404 });
    }

    const eventData = eventResult[0];
    const mediaRows = await db
      .select({
        id: eventMedia.id,
        role: eventMedia.role,
        displayOrder: eventMedia.displayOrder,
        publicUrl: eventMedia.publicUrl,
      })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, eventId))
      .orderBy(asc(eventMedia.role), asc(eventMedia.displayOrder));

    const media = mediaRows.map((item) => ({
      id: item.id,
      role: item.role,
      display_order: item.displayOrder,
      public_url: item.publicUrl,
    }));
    if (
      eventData.posterUrl &&
      !media.some((item) => item.role === 'cover')
    ) {
      media.unshift({
        id: 'legacy-poster',
        role: 'cover',
        display_order: 0,
        public_url: eventData.posterUrl,
      });
    }

    // Fetch pending count
    const pendingResult = await db.select({ value: count() })
      .from(registrations)
      .where(and(
        eq(registrations.eventId, eventId),
        eq(registrations.status, 'Pending')
      ));

    // Fetch accepted count
    const acceptedResult = await db.select({ value: count() })
      .from(registrations)
      .where(and(
        eq(registrations.eventId, eventId),
        eq(registrations.status, 'Accepted')
      ));

    // Fetch present count using presenceStatus
    const presentResult = await db.select({ value: count() })
      .from(registrations)
      .where(and(
        eq(registrations.eventId, eventId),
        eq(registrations.presenceStatus, 'Present')
      ));

    return NextResponse.json({
      status: 'success',
      data: {
        name: eventData.name,
        description: eventData.description,
        location: eventData.location,
        date: eventData.date,
        posterUrl: eventData.posterUrl,
        posterAspectMode: eventData.posterAspectMode,
        registrationMode: eventData.registrationMode,
        status: eventData.status,
        media,
        total_capacity: eventData.capacity,
        pending: pendingResult[0].value,
        accepted: acceptedResult[0].value,
        present: presentResult[0].value
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Error fetching event stats for ${eventId}:`, error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
