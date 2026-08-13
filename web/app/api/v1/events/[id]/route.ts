import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, formFields } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [event] = await db
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
      })
      .from(events)
      .where(uuidRegex.test(id) ? eq(events.id, id) : eq(events.slug, id))
      .limit(1);

    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const publicFormFields = await db
      .select({
        id: formFields.id,
        fieldName: formFields.fieldName,
        fieldType: formFields.fieldType,
        isRequired: formFields.isRequired,
        options: formFields.options,
        order: formFields.order,
      })
      .from(formFields)
      .where(eq(formFields.eventId, event.id))
      .orderBy(asc(formFields.order));

    const publicEvent = {
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      date: event.date,
      posterUrl: event.posterUrl,
      capacity: event.capacity,
      registrationMode: event.registrationMode,
      formFields: publicFormFields,
    };

    return NextResponse.json({ status: 'success', data: publicEvent });
  } catch (error: any) {
    console.error('Error fetching event details:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.capacity !== undefined) updateData.capacity = parseInt(body.capacity, 10);
    if (body.registration_mode !== undefined) {
      if (body.registration_mode !== 'Auto-Accept' && body.registration_mode !== 'Manual Review') {
        return NextResponse.json({ status: 'error', message: 'Registration mode tidak valid' }, { status: 400 });
      }
      updateData.registrationMode = body.registration_mode;
    }

    updateData.updatedAt = new Date();

    const [updatedEvent] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();

    return NextResponse.json({ status: 'success', message: 'Event berhasil diperbarui', data: updatedEvent });
  } catch (error: any) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
