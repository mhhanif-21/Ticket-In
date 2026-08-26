import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { and, asc, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { EventValidationError, validateEventCreatePayload } from '@/lib/validation/event';

export const runtime = 'nodejs';

const EVENT_STATUSES = new Set(['Draft', 'Published', 'Cancelled']);
const EVENT_SORTS = new Set(['date_desc', 'date_asc', 'created_desc', 'created_asc']);

function readPositiveInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : null;
}

function readDateFilter(value: string | null) {
  if (value === null || value.trim() === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return NextResponse.json({
        status: 'error',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Permintaan pembuatan acara tidak valid. Silakan coba lagi.',
      }, { status: 400 });
    }

    const [existingByKey] = await db
      .select()
      .from(events)
      .where(eq(events.creationKey, idempotencyKey))
      .limit(1);
    if (existingByKey) {
      return NextResponse.json({
        status: 'success',
        message: 'Event sebelumnya digunakan kembali',
        data: existingByKey,
        idempotent_replay: true,
      }, { status: 200 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ status: 'error', code: 'EVENT_PAYLOAD_INVALID', message: 'Payload JSON tidak valid.' }, { status: 400 });
    }

    const eventInput = validateEventCreatePayload(body);

    // Generate slug
    const baseSlug = eventInput.slug;
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug exists
    while (true) {
      const existing = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug));
      if (existing.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const insertedEvents = await db.insert(events).values({
      name: eventInput.name,
      slug,
      capacity: eventInput.capacity,
      location: eventInput.location,
      date: eventInput.date,
      description: eventInput.description,
      registrationMode: eventInput.registrationMode,
      volunteerPinHash: '', // Dummy for now, generated in S3-T4
      creationKey: idempotencyKey,
      status: 'Draft',
    }).onConflictDoNothing({ target: events.creationKey }).returning();

    const [newEvent] = insertedEvents;
    if (!newEvent) {
      const [replayedEvent] = await db
        .select()
        .from(events)
        .where(eq(events.creationKey, idempotencyKey))
        .limit(1);
      if (replayedEvent) {
        return NextResponse.json({
          status: 'success',
          message: 'Event sebelumnya digunakan kembali',
          data: replayedEvent,
          idempotent_replay: true,
        }, { status: 200 });
      }
      throw new Error('Event idempotency conflict could not be resolved');
    }

    return NextResponse.json(
      { status: 'success', message: 'Event berhasil dibuat', data: newEvent, idempotent_replay: false },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof EventValidationError) {
      return NextResponse.json(
        { status: 'error', code: error.code, message: error.message, field: error.field },
        { status: 422 },
      );
    }
    console.error('Error creating event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    const requestUrl = new URL(req.url);
    const page = readPositiveInteger(requestUrl.searchParams.get('page'), 1, 1000000);
    const limit = readPositiveInteger(requestUrl.searchParams.get('limit'), 20, 100);
    const sort = requestUrl.searchParams.get('sort') ?? 'date_desc';
    const status = requestUrl.searchParams.get('status');
    const search = requestUrl.searchParams.get('search')?.trim() ?? '';
    const dateFrom = readDateFilter(requestUrl.searchParams.get('date_from'));
    const dateTo = readDateFilter(requestUrl.searchParams.get('date_to'));
    if (page === null || limit === null || !EVENT_SORTS.has(sort) ||
      (status !== null && !EVENT_STATUSES.has(status)) ||
      dateFrom === null || dateTo === null) {
      return NextResponse.json({ status: 'error', message: 'Parameter daftar acara tidak valid' }, { status: 400 });
    }

    const conditions = [];
    if (role === 'admin') {
      // Admin may paginate the complete directory.
    } else if (role === 'volunteer') {
      const eventId = req.headers.get('x-event-id');
      if (!eventId) {
        return NextResponse.json({ status: 'error', message: 'Event ID missing for volunteer' }, { status: 400 });
      }
      conditions.push(eq(events.id, eventId));
    } else {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    if (status) conditions.push(eq(events.status, status));
    if (dateFrom) conditions.push(gte(events.date, dateFrom));
    if (dateTo) conditions.push(lte(events.date, dateTo));
    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      conditions.push(or(
        ilike(events.name, pattern),
        ilike(events.slug, pattern),
        ilike(events.location, pattern),
      ));
    }
    const where = conditions.length === 0 ? undefined : and(...conditions);
    const [totalRow] = await db.select({ value: count() }).from(events).where(where);
    const query = db.select().from(events).where(where);
    const orderedQuery = sort === 'date_asc'
      ? query.orderBy(asc(events.date), asc(events.id))
      : sort === 'created_desc'
        ? query.orderBy(desc(events.createdAt), desc(events.id))
        : sort === 'created_asc'
          ? query.orderBy(asc(events.createdAt), asc(events.id))
          : query.orderBy(desc(events.date), desc(events.id));
    const data = await orderedQuery.limit(limit).offset((page - 1) * limit);
    const total = Number(totalRow?.value ?? 0);
    return NextResponse.json({
      status: 'success',
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next_page: page * limit < total,
      },
    });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
