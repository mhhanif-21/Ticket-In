import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, registrations } from '@/db/schema';
import { count, desc, eq, sql } from 'drizzle-orm';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

// Operational dashboard metrics must reflect registrations/check-ins immediately.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!await getAuthenticatedAdmin(request)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
    const totalEventsResult = await db.select({ value: count() }).from(events);
    const totalRegistrationsResult = await db.select({ value: count() }).from(registrations);
    const totalPresentResult = await db.select({ value: count() })
      .from(registrations)
      .where(eq(registrations.presenceStatus, 'Present'));

    // [BUG-039] FIX: Tambahkan subquery untuk menghitung registrants_count aktual per event
    // Sebelumnya hanya mengembalikan `capacity` (batas kuota), bukan jumlah pendaftar nyata
    const recentEvents = await db.select({
      id: events.id,
      name: events.name,
      slug: events.slug,
      date: events.date,
      location: events.location,
      createdAt: events.createdAt,
      capacity: events.capacity,
      registrants_count: sql<number>`(
        SELECT COUNT(*)::int FROM registrations r
        WHERE r.event_id = ${events.id}
      )`,
    })
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(5);

    return NextResponse.json({
      status: 'success',
      data: {
        total_events: totalEventsResult[0].value,
        total_registrations: totalRegistrationsResult[0].value,
        total_present: totalPresentResult[0].value,
        recent_events: recentEvents
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
