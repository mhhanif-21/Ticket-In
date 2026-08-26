import { NextResponse } from 'next/server';
import { db } from '@/db';
import { eventMedia, events, formFields, registrations } from '@/db/schema';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { getCanonicalBaseUrl } from '@/lib/security/url';
import { getRegistrationFieldKey } from '@/lib/validation/registrationForm';
import {
  EventLifecycleError,
  canTransitionEventStatus,
} from '@/lib/events/eventLifecycle';
import { EventValidationError, validateEventUpdatePayload } from '@/lib/validation/event';
import { cancelEventOperationalAccessTx } from '@/lib/events/eventLifecycleActions';
import {
  CAPACITY_CONSUMING_REGISTRATION_STATUSES,
  expireStaleDraftRegistrationsForEventTx,
} from '@/lib/registration/draftLifecycle';

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
        fieldKey: formFields.fieldKey,
        fieldKind: formFields.fieldKind,
      })
      .from(formFields)
      .where(eq(formFields.eventId, event.id))
      .orderBy(asc(formFields.order));

    const media = await db
      .select({
        role: eventMedia.role,
        displayOrder: eventMedia.displayOrder,
        publicUrl: eventMedia.publicUrl,
      })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, event.id))
      .orderBy(asc(eventMedia.role), asc(eventMedia.displayOrder));

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
          fieldKey: getRegistrationFieldKey(field),
          fieldKind: field.fieldKind,
        })),
      media,
      public_registration_url: `${canonicalBaseUrl}/${event.slug}`,
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ status: 'error', code: 'EVENT_PAYLOAD_INVALID', message: 'Payload JSON tidak valid.' }, { status: 400 });
    }

    const input = validateEventUpdatePayload(body);
    const updatedEvent = await db.transaction(async (tx) => {
      // Use the same event-row lock as registration creation. This makes a
      // capacity reduction and a concurrent registration mutually exclusive.
      const [existing] = await tx
        .select()
        .from(events)
        .where(eq(events.id, id))
        .for('update')
        .limit(1);
      if (!existing) return null;

      const updateData: Partial<typeof events.$inferInsert> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.slug !== undefined) updateData.slug = input.slug;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.location !== undefined) updateData.location = input.location;
      if (input.date !== undefined) updateData.date = input.date;
      if (input.capacity !== undefined) {
        await expireStaleDraftRegistrationsForEventTx(tx, existing.id);
        const [activeRegistrations] = await tx
          .select({ count: count() })
          .from(registrations)
          .where(and(
            eq(registrations.eventId, existing.id),
            inArray(registrations.status, CAPACITY_CONSUMING_REGISTRATION_STATUSES),
          ));
        if (Number(activeRegistrations.count) > input.capacity) {
          throw new EventValidationError(
            'EVENT_CAPACITY_BELOW_REGISTRATIONS',
            'Kapasitas tidak boleh lebih kecil dari jumlah pendaftaran aktif.',
            'capacity',
          );
        }
        updateData.capacity = input.capacity;
      }
      if (input.registrationMode !== undefined) updateData.registrationMode = input.registrationMode;
      if (input.status !== undefined) {
        const nextStatus = input.status;
        if (!canTransitionEventStatus(existing.status, nextStatus)) {
          throw new EventLifecycleError(`Transisi status acara dari ${existing.status} ke ${nextStatus} tidak diizinkan`);
        }
        updateData.status = nextStatus;
      }
      updateData.updatedAt = new Date();

      const [updated] = await tx
        .update(events)
        .set(updateData)
        .where(eq(events.id, id))
        .returning();
      if (input.status === 'Cancelled') {
        await cancelEventOperationalAccessTx(tx, id);
      }
      return updated;
    });

    if (!updatedEvent) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', message: 'Event berhasil diperbarui', data: updatedEvent });
  } catch (error: unknown) {
    if (error instanceof EventValidationError) {
      return NextResponse.json(
        { status: 'error', code: error.code, message: error.message, field: error.field },
        { status: 422 },
      );
    }
    if (error instanceof EventLifecycleError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    }
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
