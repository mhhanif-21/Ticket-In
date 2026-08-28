import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations, ticketGenerationJobs } from '@/db/schema';
import { eq, and, or, ilike, desc, asc, sql } from 'drizzle-orm';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['Draft', 'Pending', 'Accepted', 'Rejected']);
const VALID_ATTENDANCE = new Set(['true', 'false']);
const VALID_SORTS = new Set(['asc', 'desc']);
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDateValue(value: string): { date: Date; dateOnly: boolean } | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  if (dateOnly) {
    const [year, month, day] = value.split('-').map(Number);
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() + 1 !== month
      || date.getUTCDate() !== day
    ) return null;
  }
  return { date, dateOnly };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedAdmin(request)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const { id: eventId } = await params;
    
    // Extract filters
    const search = searchParams.get('search');
    const status = searchParams.get('status')?.trim() || null;
    const attendance = searchParams.get('attendance')?.trim() || null;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const sort = searchParams.get('sort') || 'desc';
    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const limit = parsePositiveInteger(searchParams.get('limit'), 10);

    if (page === null || limit === null || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ status: 'error', message: `Parameter page/limit tidak valid. Limit maksimum ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ status: 'error', message: 'Status peserta tidak valid.' }, { status: 400 });
    }
    if (attendance && !VALID_ATTENDANCE.has(attendance)) {
      return NextResponse.json({ status: 'error', message: 'Parameter attendance harus true atau false.' }, { status: 400 });
    }
    if (!VALID_SORTS.has(sort)) {
      return NextResponse.json({ status: 'error', message: 'Parameter sort harus asc atau desc.' }, { status: 400 });
    }

    const parsedStartDate = startDate ? parseDateValue(startDate) : null;
    const parsedEndDate = endDate ? parseDateValue(endDate) : null;
    if ((startDate && !parsedStartDate) || (endDate && !parsedEndDate)) {
      return NextResponse.json({ status: 'error', message: 'Format tanggal tidak valid.' }, { status: 400 });
    }
    if (parsedStartDate && parsedEndDate && parsedStartDate.date > parsedEndDate.date) {
      return NextResponse.json({ status: 'error', message: 'start_date tidak boleh setelah end_date.' }, { status: 400 });
    }
    
    // Registration status and attendance are independent dimensions. Keep
    // date filtering separate for backward compatibility with the existing
    // participant-list contract, but allow status + attendance together.
    if ((startDate || endDate) && (status || attendance)) {
      return NextResponse.json(
        { status: 'error', message: 'Filter waktu tidak dapat digabungkan dengan status atau kehadiran.' },
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
      conditions.push(sql`${registrations.createdAt} >= ${parsedStartDate!.date.toISOString()}`);
    }

    if (endDate) {
      if (parsedEndDate!.dateOnly) {
        // A date-only end boundary includes the complete selected day.
        const nextDay = new Date(parsedEndDate!.date.getTime() + 24 * 60 * 60 * 1000);
        conditions.push(sql`${registrations.createdAt} < ${nextDay.toISOString()}`);
      } else {
        conditions.push(sql`${registrations.createdAt} <= ${parsedEndDate!.date.toISOString()}`);
      }
    }

    const offset = (page - 1) * limit;

    const data = await db
      .select({
        id: registrations.id,
        eventId: registrations.eventId,
        name: registrations.name,
        email: registrations.email,
        answers: registrations.answers,
        answerFieldLabels: registrations.answerFieldLabels,
        status: registrations.status,
        ticketCode: registrations.ticketCode,
        qrCodeUrl: registrations.qrCodeUrl,
        presenceStatus: registrations.presenceStatus,
        createdAt: registrations.createdAt,
        updatedAt: registrations.updatedAt,
        ticketJobStatus: ticketGenerationJobs.status,
        ticketJobLastError: ticketGenerationJobs.lastError,
      })
      .from(registrations)
      .leftJoin(ticketGenerationJobs, eq(ticketGenerationJobs.registrationId, registrations.id))
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
