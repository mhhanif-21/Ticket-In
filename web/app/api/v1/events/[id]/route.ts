import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events, formFields } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getCanonicalBaseUrl } from '@/lib/security/url';
import { getRegistrationFieldKey } from '@/lib/validation/registrationForm';
import {
  EventLifecycleError,
  canTransitionEventStatus,
  normalizeEventStatus,
} from '@/lib/events/eventLifecycle';

export const runtime = 'nodejs';
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
        status: events.status,
      })
      .from(events)
      .where(uuidRegex.test(id)
        ? eq(events.id, id)
        : and(eq(events.slug, id), eq(events.status, 'Published')))
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

    const canonicalBaseUrl = getCanonicalBaseUrl(req);

    const eventDetail = {
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      date: event.date,
      posterUrl: event.posterUrl,
      capacity: event.capacity,
      registrationMode: event.registrationMode,
      status: event.status,
      formFields: uuidRegex.test(id)
        ? publicFormFields
        : publicFormFields.map((field) => ({
          fieldName: field.fieldName,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          options: field.options,
          order: field.order,
          fieldKey: getRegistrationFieldKey({ order: field.order }),
        })),
      public_registration_url: `${canonicalBaseUrl}/${event.slug}/register`,
      public_qr_code_url: `${canonicalBaseUrl}/api/v1/events/${event.slug}/qr`,
    };

    // UUID adalah kontrak detail Admin yang dijaga middleware; slug adalah DTO publik.
    const responseData = uuidRegex.test(id)
      ? { id: event.id, ...eventDetail }
      : eventDetail;

    return NextResponse.json({ status: 'success', data: responseData });
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
    const body = await req.json() as Record<string, unknown>;

    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const updateData: Partial<typeof events.$inferInsert> = {};
    if (typeof body.name === 'string') updateData.name = body.name;
    if (body.description === null || typeof body.description === 'string') updateData.description = body.description;
    if (typeof body.location === 'string') updateData.location = body.location;
    if (typeof body.date === 'string') updateData.date = new Date(body.date);
    if (body.capacity !== undefined) updateData.capacity = parseInt(String(body.capacity), 10);
    if (body.registration_mode !== undefined) {
      if (body.registration_mode !== 'Auto-Accept' && body.registration_mode !== 'Manual Review') {
        return NextResponse.json({ status: 'error', message: 'Registration mode tidak valid' }, { status: 400 });
      }
      updateData.registrationMode = body.registration_mode as 'Auto-Accept' | 'Manual Review';
    }
    if (body.status !== undefined) {
      let nextStatus;
      try {
        nextStatus = normalizeEventStatus(body.status);
      } catch (error) {
        if (error instanceof EventLifecycleError) {
          return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
        }
        throw error;
      }
      if (!canTransitionEventStatus(existing.status, nextStatus)) {
        return NextResponse.json({
          status: 'error',
          message: `Transisi status acara dari ${existing.status} ke ${nextStatus} tidak diizinkan`,
        }, { status: 409 });
      }
      updateData.status = nextStatus;
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

// Bug 5 FIX: DELETE endpoint untuk menghapus event beserta semua data terkait
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    // Hapus form fields dulu (foreign key constraint)
    await db.delete(formFields).where(eq(formFields.eventId, id));
    // Hapus event
    await db.delete(events).where(eq(events.id, id));

    return NextResponse.json({ status: 'success', message: 'Event berhasil dihapus' });
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
