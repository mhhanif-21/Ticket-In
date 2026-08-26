import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMedia, events } from '@/db/schema';
import {
  type EventMediaFile,
  type ValidatedEventMedia,
  validateEventMediaFiles,
} from '@/lib/events/eventMedia';
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

function mediaPath(eventId: string, media: ValidatedEventMedia): string {
  return media.role === 'cover'
    ? `${eventId}/cover`
    : `${eventId}/gallery-${media.displayOrder}`;
}

async function uploadMedia(
  eventId: string,
  media: ValidatedEventMedia,
): Promise<StoredEventMedia> {
  const storagePath = mediaPath(eventId, media);
  const buffer = Buffer.from(await media.file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKETS.eventPosters)
    .upload(storagePath, buffer, {
      contentType: media.mimeType,
      upsert: true,
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
    const validated = await validateEventMediaFiles({
      cover: input.cover,
      gallery: input.gallery,
    });
    const existing = await db
      .select({
        role: eventMedia.role,
        displayOrder: eventMedia.displayOrder,
        storagePath: eventMedia.storagePath,
      })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, input.eventId));

    const uploaded = [] as StoredEventMedia[];
    for (const media of validated) {
      uploaded.push(await uploadMedia(input.eventId, media));
    }

    const cover = uploaded.find((media) => media.role === 'cover');
    if (!cover) throw new EventMediaUploadError();

    const gallery = uploaded.filter((media) => media.role === 'gallery');
    const now = new Date();

    await db.transaction(async (transaction) => {
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

    const activePaths = new Set(uploaded.map((media) => media.storagePath));
    if (input.replaceGallery) {
      const removedPaths = existing
        .filter((media) => media.role === 'gallery' && media.storagePath && !activePaths.has(media.storagePath))
        .map((media) => media.storagePath as string);

      if (removedPaths.length > 0) {
        const { error } = await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.eventPosters)
          .remove(removedPaths);
        if (error) {
          console.error('Event media cleanup failed', { eventId: input.eventId, count: removedPaths.length });
        }
      }
    }

    return {
      posterUrl: cover.publicUrl,
      media: activeMedia,
    };
  }
}
