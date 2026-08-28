import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMedia, events } from '@/db/schema';
import {
  PromoteEventMediaAction,
  ReplaceEventMediaAction,
  EventMediaUploadError,
} from '@/lib/actions/ReplaceEventMediaAction';
import { EventMediaValidationError } from '@/lib/events/eventMedia';
import {
  EventGalleryReconciliationError,
  reconcileEventGallery,
} from '@/lib/events/eventGallery';
import { queueStorageCleanupJobsTx } from '@/lib/storage/cleanupLifecycle';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';

export const runtime = 'nodejs';

function isMediaFile(value: FormDataEntryValue | null): value is File {
  return value !== null
    && typeof value === 'object'
    && 'arrayBuffer' in value
    && 'size' in value
    && 'name' in value;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (req.headers.get('x-user-role') !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const formData = await req.formData();
    const cover = formData.get('cover');
    const gallery = formData.getAll('gallery').filter(isMediaFile);
    if (!isMediaFile(cover)) {
      return NextResponse.json({
        status: 'error',
        code: 'MEDIA_FILE_MISSING',
        message: 'Poster acara wajib diunggah.',
      }, { status: 400 });
    }

    const result = await ReplaceEventMediaAction.execute({
      eventId: id,
      cover,
      gallery,
      replaceGallery: formData.get('replace_gallery') === 'true',
    });

    return NextResponse.json({
      status: 'success',
      message: 'Media acara berhasil diperbarui',
      data: result,
    });
  } catch (error) {
    if (error instanceof EventMediaValidationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof EventMediaUploadError) {
      return NextResponse.json({ status: 'error', code: 'MEDIA_UPLOAD_FAILED', message: error.message }, { status: 502 });
    }

    console.error('event_media_unavailable', { errorName: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({
      status: 'error',
      code: 'MEDIA_UPLOAD_UNAVAILABLE',
      message: 'Media acara sementara tidak tersedia. Silakan coba lagi.',
    }, { status: 503 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (req.headers.get('x-user-role') !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const body: unknown = await req.json().catch(() => null);
    const promoteMediaId = body && typeof body === 'object'
      && 'promote_media_id' in body
      && typeof body.promote_media_id === 'string'
      ? body.promote_media_id
      : null;
    if (promoteMediaId !== null) {
      const { id } = await params;
      const promoted = await PromoteEventMediaAction.execute({
        eventId: id,
        mediaId: promoteMediaId,
      });
      return NextResponse.json({ status: 'success', data: { media: [promoted] } });
    }

    const requestedIds = body && typeof body === 'object'
      && 'gallery_media_ids' in body
      && Array.isArray(body.gallery_media_ids)
      ? body.gallery_media_ids
      : null;
    const replaceGallery = body && typeof body === 'object'
      && 'replace_gallery' in body
      && body.replace_gallery === true;
    if (!replaceGallery || requestedIds === null || !requestedIds.every((id) => typeof id === 'string')) {
      return NextResponse.json({
        status: 'error',
        code: 'MEDIA_GALLERY_PAYLOAD_INVALID',
        message: 'Payload galeri tidak valid.',
      }, { status: 400 });
    }

    const { id } = await params;
    const media = await db.transaction(async (transaction) => {
      const [event] = await transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, id))
        .for('update')
        .limit(1);
      if (!event) return null;

      const existing = await transaction
        .select({
          id: eventMedia.id,
          eventId: eventMedia.eventId,
          storagePath: eventMedia.storagePath,
          publicUrl: eventMedia.publicUrl,
          createdAt: eventMedia.createdAt,
        })
        .from(eventMedia)
        .where(and(eq(eventMedia.eventId, id), eq(eventMedia.role, 'gallery')))
        .for('update');
      const plan = reconcileEventGallery(existing, requestedIds);
      const now = new Date();

      await transaction
        .delete(eventMedia)
        .where(and(eq(eventMedia.eventId, id), eq(eventMedia.role, 'gallery')));
      if (plan.retained.length > 0) {
        await transaction.insert(eventMedia).values(plan.retained.map((item, displayOrder) => ({
          id: item.id,
          eventId: item.eventId,
          role: 'gallery' as const,
          displayOrder,
          storagePath: item.storagePath,
          publicUrl: item.publicUrl,
          createdAt: item.createdAt,
          updatedAt: now,
        })));
      }
      await queueStorageCleanupJobsTx(
        transaction,
        plan.removed
          .filter((item) => item.storagePath)
          .map((item) => ({
            bucket: STORAGE_BUCKETS.eventPosters,
            storagePath: item.storagePath as string,
            reason: 'event_media_replace' as const,
          })),
      );

      return plan.retained.map((item, displayOrder) => ({
        id: item.id,
        role: 'gallery',
        displayOrder,
        publicUrl: item.publicUrl,
      }));
    });
    if (media === null) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }
    return NextResponse.json({ status: 'success', data: { media } });
  } catch (error) {
    if (error instanceof EventGalleryReconciliationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: 422 });
    }
    console.error('event_gallery_reconcile_unavailable', { errorName: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({
      status: 'error',
      code: 'MEDIA_GALLERY_UNAVAILABLE',
      message: 'Galeri acara sementara tidak tersedia. Silakan coba lagi.',
    }, { status: 503 });
  }
}
