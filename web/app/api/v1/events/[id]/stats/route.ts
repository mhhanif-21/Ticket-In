import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, registrations } from '@/db/schema';
import { eq, and, count } from 'drizzle-orm';

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
      date: events.date,
      posterUrl: events.posterUrl,
      status: events.status,
    })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (eventResult.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Event not found' }, { status: 404 });
    }

    const eventData = eventResult[0];

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
        date: eventData.date,
        posterUrl: eventData.posterUrl,
        status: eventData.status,
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
