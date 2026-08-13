import { NextResponse } from 'next/server';
import { db } from '../../../../../../db';
import { registrations } from '../../../../../../db/schema';
import { eq, and, or, ilike, desc, asc, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const { id: eventId } = await params;
    
    // Extract filters
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const attendance = searchParams.get('attendance');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const sort = searchParams.get('sort') || 'desc';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    // FR-ADM-10: Mutually Exclusive Filter Check
    let filterCount = 0;
    if (status) filterCount++;
    if (attendance) filterCount++;
    if (startDate || endDate) filterCount++;
    
    if (filterCount > 1) {
      return NextResponse.json(
        { status: 'error', message: 'Hanya satu jenis filter (Status, Kehadiran, atau Waktu) yang boleh aktif secara bersamaan.' },
        { status: 400 }
      );
    }

    const conditions = [eq(registrations.eventId, eventId)];

    if (search) {
      conditions.push(
        or(
          ilike(registrations.name, `%${search}%`),
          ilike(registrations.email, `%${search}%`)
        )!
      );
    }

    if (status) {
      conditions.push(eq(registrations.status, status as any));
    }

    if (attendance) {
      conditions.push(eq(registrations.presenceStatus, attendance === 'true' ? 'Present' : 'Absent'));
    }

    if (startDate) {
      conditions.push(sql`${registrations.createdAt} >= ${new Date(startDate).toISOString()}`);
    }

    if (endDate) {
      conditions.push(sql`${registrations.createdAt} <= ${new Date(endDate).toISOString()}`);
    }

    const offset = (page - 1) * limit;

    const data = await db
      .select()
      .from(registrations)
      .where(and(...conditions))
      .orderBy(sort === 'asc' ? asc(registrations.createdAt) : desc(registrations.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(registrations)
      .where(and(...conditions));

    return NextResponse.json({
      status: 'success',
      data,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('List Registrations Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
