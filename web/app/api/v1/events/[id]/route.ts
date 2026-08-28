import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  eventMedia,
  events,
  eventTicketTemplates,
  exportJobs,
  formFields,
  participantFileUploads,
  registrations,
} from '@/db/schema';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
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
import { queueStorageCleanupJobsTx } from '@/lib/storage/cleanupLifecycle';
import { EXPORT_STORAGE_BUCKET, STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { getPublicStorageObjectPath } from '@/lib/storage/publicObjectPath';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

export const runtime = 'nodejs';
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const isAdminDetail = uuidRegex.test(id);
    if (isAdminDetail && !await getAuthenticatedAdmin(req)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const [event] = await db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        description: events.description,
        location: events.location,
        date: events.date,
        posterUrl: events.posterUrl,
        posterAspectMode: events.posterAspectMode,
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
        id: eventMedia.id,
        role: eventMedia.role,
        displayOrder: eventMedia.displayOrder,
        publicUrl: eventMedia.publicUrl,
      })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, event.id))
      .orderBy(asc(eventMedia.role), asc(eventMedia.displayOrder));
    const orderedMedia = [...media].sort((left, right) => {
      const leftRole = left.role === 'cover' ? 0 : 1;
      const rightRole = right.role === 'cover' ? 0 : 1;
      return leftRole - rightRole || left.displayOrder - right.displayOrder;
    });

    const isPublished = event.status === 'Published';
    const canonicalBaseUrl = isPublished ? getCanonicalBaseUrl(req) : null;

    const eventDetail = {
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      date: event.date,
      posterUrl: event.posterUrl,
      posterAspectMode: event.posterAspectMode,
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
      media: orderedMedia,
      // Public access is a lifecycle capability, not merely a UI concern.
      // The QR endpoint and public registration route both require Published;
      // do not advertise links that will deterministically return 404/409.
      public_registration_url: isPublished && canonicalBaseUrl
        ? `${canonicalBaseUrl}/${event.slug}`
        : null,
      public_qr_code_url: isPublished && canonicalBaseUrl
        ? `${canonicalBaseUrl}/api/v1/events/${event.slug}/qr`
        : null,
    };

    // UUID adalah kontrak detail Admin yang dijaga middleware; slug adalah DTO publik.
    const responseData = isAdminDetail
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
      if (input.posterAspectMode !== undefined) updateData.posterAspectMode = input.posterAspectMode;
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    const deleted = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: events.id, posterUrl: events.posterUrl })
        .from(events)
        .where(eq(events.id, id))
        .for('update')
        .limit(1);
      if (!existing) return false;

      const media = await tx
        .select({ storagePath: eventMedia.storagePath })
        .from(eventMedia)
        .where(eq(eventMedia.eventId, id));
      const [ticketTemplate] = await tx
        .select({ backgroundPath: eventTicketTemplates.backgroundPath })
        .from(eventTicketTemplates)
        .where(eq(eventTicketTemplates.eventId, id))
        .limit(1);
      const ticketUrls = await tx
        .select({ qrCodeUrl: registrations.qrCodeUrl })
        .from(registrations)
        .where(eq(registrations.eventId, id));
      const exports = await tx
        .select({ storagePath: exportJobs.storagePath })
        .from(exportJobs)
        .where(eq(exportJobs.eventId, id));

      const cleanupObjects = [
        ...media.flatMap((item) => item.storagePath ? [{
          bucket: STORAGE_BUCKETS.eventPosters,
          storagePath: item.storagePath,
          reason: 'event_delete' as const,
        }] : []),
        ...(ticketTemplate?.backgroundPath ? [{
          bucket: STORAGE_BUCKETS.ticketTemplates,
          storagePath: ticketTemplate.backgroundPath,
          reason: 'event_delete' as const,
        }] : []),
        ...ticketUrls.flatMap((item) => {
          const storagePath = getPublicStorageObjectPath(item.qrCodeUrl, STORAGE_BUCKETS.tickets);
          return storagePath ? [{ bucket: STORAGE_BUCKETS.tickets, storagePath, reason: 'event_delete' as const }] : [];
        }),
        ...exports.flatMap((item) => item.storagePath ? [{
          bucket: EXPORT_STORAGE_BUCKET,
          storagePath: item.storagePath,
          reason: 'event_delete' as const,
        }] : []),
      ];
      const legacyPosterPath = getPublicStorageObjectPath(existing.posterUrl, STORAGE_BUCKETS.eventPosters);
      if (legacyPosterPath) {
        cleanupObjects.push({
          bucket: STORAGE_BUCKETS.eventPosters,
          storagePath: legacyPosterPath,
          reason: 'event_delete',
        });
      }
      await queueStorageCleanupJobsTx(tx, cleanupObjects);

      // `registration_id` is SET NULL by the event cascade. Mark claimed
      // participant files first so the durable file reconciler owns them.
      const now = new Date();
      await tx
        .update(participantFileUploads)
        .set({
          registrationId: null,
          status: 'cleanup_pending',
          nextAttemptAt: now,
          cleanupLeaseExpiresAt: null,
          updatedAt: now,
        })
        .where(and(
          eq(participantFileUploads.status, 'claimed'),
          sql`${participantFileUploads.registrationId} IN (
            SELECT ${registrations.id}
            FROM ${registrations}
            WHERE ${registrations.eventId} = ${id}
          )`,
        ));

      await tx.delete(formFields).where(eq(formFields.eventId, id));
      await tx.delete(events).where(eq(events.id, id));
      return true;
    });

    if (!deleted) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', message: 'Event berhasil dihapus' });
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
