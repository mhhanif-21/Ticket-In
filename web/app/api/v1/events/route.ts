import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { EventValidationError, validateEventCreatePayload } from '@/lib/validation/event';

export const runtime = 'nodejs';

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
    
    if (role === 'admin') {
      const allEvents = await db.select().from(events);
      return NextResponse.json({ status: 'success', data: allEvents });
    } else if (role === 'volunteer') {
      const eventId = req.headers.get('x-event-id');
      if (!eventId) {
        return NextResponse.json({ status: 'error', message: 'Event ID missing for volunteer' }, { status: 400 });
      }
      const myEvents = await db.select().from(events).where(eq(events.id, eventId));
      return NextResponse.json({ status: 'success', data: myEvents });
    } else {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
