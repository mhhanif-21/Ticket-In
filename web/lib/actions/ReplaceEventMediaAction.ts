import { randomUUID } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMedia, events } from '@/db/schema';
import {
  type EventMediaFile,
  type ValidatedEventMedia,
  EventMediaValidationError,
  validateEventGalleryFiles,
  validateEventMediaFiles,
} from '@/lib/events/eventMedia';
import {
  activateHeldStorageCleanupJobs,
  holdStorageCleanupJobs,
  queueStorageCleanupJobsTx,
  releaseHeldStorageCleanupJobsTx,
} from '@/lib/storage/cleanupLifecycle';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';

export class EventMediaUploadError extends Error {
  constructor() {
    super('Media acara belum dapat diunggah. Silakan coba lagi.');
    this.name = 'EventMediaUploadError';
  }
}

type ReplaceEventMediaInput = {
  eventId: string;
  cover: EventMediaFile;
  gallery: EventMediaFile[];
  replaceGallery: boolean;
};

type StoredEventMedia = {
  role: 'cover' | 'gallery';
  displayOrder: number;
  storagePath: string;
  publicUrl: string;
};

function fileExtension(mimeType: ValidatedEventMedia['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}

function mediaPath(eventId: string, media: ValidatedEventMedia): string {
  return `${eventId}/${media.role}/${randomUUID()}.${fileExtension(media.mimeType)}`;
}

async function uploadMedia(
  media: ValidatedEventMedia,
  storagePath: string,
  eventId: string,
): Promise<StoredEventMedia> {
  const buffer = Buffer.from(await media.file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKETS.eventPosters)
    .upload(storagePath, buffer, {
      contentType: media.mimeType,
      upsert: false,
    });

  if (error) {
    console.error('Event media upload failed', { eventId, role: media.role, code: error.statusCode });
    throw new EventMediaUploadError();
  }

  const { data } = supabaseAdmin.storage
    .from(STORAGE_BUCKETS.eventPosters)
    .getPublicUrl(storagePath);

  return {
    role: media.role,
    displayOrder: media.displayOrder,
    storagePath,
    publicUrl: data.publicUrl,
  };
}

export class ReplaceEventMediaAction {
  static async execute(input: ReplaceEventMediaInput) {
    if (!input.replaceGallery && input.gallery.length > 0) {
      throw new EventMediaValidationError(
        'MEDIA_GALLERY_REPLACE_REQUIRED',
        422,
        'Aktifkan replace_gallery untuk mengganti foto galeri.',
      );
    }

    const validated = await validateEventMediaFiles({
      cover: input.cover,
      gallery: input.gallery,
    });
    const staged = validated.map((media) => ({
      media,
      storagePath: mediaPath(input.eventId, media),
    }));
    const stagedObjects = staged.map(({ storagePath }) => ({
      bucket: STORAGE_BUCKETS.eventPosters,
      storagePath,
      reason: 'event_media_replace' as const,
    }));

    // The ledger is persisted before upload. A process/DB failure afterwards
    // leaves an expiring hold that the cron worker can safely remove.
    await holdStorageCleanupJobs(stagedObjects);

    try {
      const uploaded: StoredEventMedia[] = [];
      for (const item of staged) {
        uploaded.push(await uploadMedia(item.media, item.storagePath, input.eventId));
      }

      const cover = uploaded.find((media) => media.role === 'cover');
      if (!cover) throw new EventMediaUploadError();
      const gallery = uploaded.filter((media) => media.role === 'gallery');
      const now = new Date();

      await db.transaction(async (transaction) => {
        const [event] = await transaction
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, input.eventId))
          .for('update')
          .limit(1);
        if (!event) throw new EventMediaUploadError();

        const existing = await transaction
          .select({
            role: eventMedia.role,
            displayOrder: eventMedia.displayOrder,
            storagePath: eventMedia.storagePath,
          })
          .from(eventMedia)
          .where(eq(eventMedia.eventId, input.eventId))
          .for('update');

        await transaction
          .insert(eventMedia)
          .values({
            eventId: input.eventId,
            role: cover.role,
            displayOrder: cover.displayOrder,
            storagePath: cover.storagePath,
            publicUrl: cover.publicUrl,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [eventMedia.eventId, eventMedia.role, eventMedia.displayOrder],
            set: {
              storagePath: cover.storagePath,
              publicUrl: cover.publicUrl,
              updatedAt: now,
            },
          });

        if (input.replaceGallery) {
          await transaction
            .delete(eventMedia)
            .where(and(eq(eventMedia.eventId, input.eventId), eq(eventMedia.role, 'gallery')));

          if (gallery.length > 0) {
            await transaction.insert(eventMedia).values(gallery.map((media) => ({
              eventId: input.eventId,
              role: media.role,
              displayOrder: media.displayOrder,
              storagePath: media.storagePath,
              publicUrl: media.publicUrl,
              updatedAt: now,
            })));
          }
        }

        await transaction
          .update(events)
          .set({ posterUrl: cover.publicUrl, updatedAt: now })
          .where(eq(events.id, input.eventId));

        await releaseHeldStorageCleanupJobsTx(transaction, stagedObjects);

        const activePaths = new Set(uploaded.map((media) => media.storagePath));
        const replacedPaths = existing
          .filter((media) => (
            (media.role === 'cover' || input.replaceGallery)
            && media.storagePath
            && !activePaths.has(media.storagePath)
          ))
          .map((media) => ({
            bucket: STORAGE_BUCKETS.eventPosters,
            storagePath: media.storagePath as string,
            reason: 'event_media_replace' as const,
          }));
        await queueStorageCleanupJobsTx(transaction, replacedPaths);
      });

      const activeMedia = await db
        .select({
          role: eventMedia.role,
          displayOrder: eventMedia.displayOrder,
          publicUrl: eventMedia.publicUrl,
        })
        .from(eventMedia)
        .where(eq(eventMedia.eventId, input.eventId))
        .orderBy(asc(eventMedia.role), asc(eventMedia.displayOrder));

      return {
        posterUrl: cover.publicUrl,
        media: activeMedia,
      };
    } catch (error) {
      // Do not delete synchronously here: the durable ledger is the recovery
      // authority even when storage is temporarily unavailable.
      await activateHeldStorageCleanupJobs(stagedObjects).catch(() => undefined);
      throw error;
    }
  }
}

type AppendEventGalleryInput = {
  eventId: string;
  gallery: EventMediaFile[];
};

export class AppendEventGalleryAction {
  static async execute(input: AppendEventGalleryInput) {
    const validated = await validateEventGalleryFiles(input.gallery);
    const staged = validated.map((media) => ({
      media,
      storagePath: mediaPath(input.eventId, media),
    }));
    const stagedObjects = staged.map(({ storagePath }) => ({
      bucket: STORAGE_BUCKETS.eventPosters,
      storagePath,
      reason: 'event_media_replace' as const,
    }));

    await holdStorageCleanupJobs(stagedObjects);
    try {
      const uploaded: StoredEventMedia[] = [];
      for (const item of staged) {
        uploaded.push(await uploadMedia(item.media, item.storagePath, input.eventId));
      }

      const media = await db.transaction(async (transaction) => {
        const [event] = await transaction
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, input.eventId))
          .for('update')
          .limit(1);
        if (!event) throw new EventMediaUploadError();

        const existingGallery = await transaction
          .select({ id: eventMedia.id })
          .from(eventMedia)
          .where(and(eq(eventMedia.eventId, input.eventId), eq(eventMedia.role, 'gallery')))
          .for('update');
        if (existingGallery.length + uploaded.length > 5) {
          throw new EventMediaValidationError(
            'MEDIA_GALLERY_LIMIT_EXCEEDED',
            422,
            'Maksimal 5 foto galeri per acara.',
          );
        }

        const now = new Date();
        const inserted = uploaded.map((item, index) => ({
          eventId: input.eventId,
          role: 'gallery' as const,
          displayOrder: existingGallery.length + index,
          storagePath: item.storagePath,
          publicUrl: item.publicUrl,
          updatedAt: now,
        }));
        const created = inserted.length > 0
          ? await transaction.insert(eventMedia).values(inserted).returning({
            id: eventMedia.id,
            role: eventMedia.role,
            displayOrder: eventMedia.displayOrder,
            publicUrl: eventMedia.publicUrl,
          })
          : [];
        await releaseHeldStorageCleanupJobsTx(transaction, stagedObjects);
        return created;
      });

      return { media };
    } catch (error) {
      await activateHeldStorageCleanupJobs(stagedObjects).catch(() => undefined);
      throw error;
    }
  }
}
