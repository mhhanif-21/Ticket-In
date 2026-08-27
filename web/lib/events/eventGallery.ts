export type PersistedGalleryMedia = {
  id: string;
  storagePath: string | null;
  publicUrl: string;
};

export class EventGalleryReconciliationError extends Error {
  constructor(
    public readonly code:
      | 'MEDIA_GALLERY_LIMIT_EXCEEDED'
      | 'MEDIA_GALLERY_DUPLICATE_ITEM'
      | 'MEDIA_GALLERY_UNKNOWN_ITEM',
    message: string,
  ) {
    super(message);
    this.name = 'EventGalleryReconciliationError';
  }
}

export function reconcileEventGallery<T extends PersistedGalleryMedia>(
  existing: T[],
  requestedIds: string[],
): {
  retained: T[];
  removed: T[];
} {
  if (requestedIds.length > 5) {
    throw new EventGalleryReconciliationError(
      'MEDIA_GALLERY_LIMIT_EXCEEDED',
      'Maksimal 5 foto galeri per acara.',
    );
  }

  const existingById = new Map(existing.map((media) => [media.id, media]));
  const requested = new Set<string>();
  const retained = requestedIds.map((id) => {
    if (requested.has(id)) {
      throw new EventGalleryReconciliationError(
        'MEDIA_GALLERY_DUPLICATE_ITEM',
        'Foto galeri tidak boleh dipilih lebih dari sekali.',
      );
    }
    requested.add(id);

    const media = existingById.get(id);
    if (!media) {
      throw new EventGalleryReconciliationError(
        'MEDIA_GALLERY_UNKNOWN_ITEM',
        'Foto galeri yang dipilih tidak ditemukan.',
      );
    }
    return media;
  });

  return {
    retained,
    removed: existing.filter((media) => !requested.has(media.id)),
  };
}
