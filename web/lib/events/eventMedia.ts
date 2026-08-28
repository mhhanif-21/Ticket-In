import {
  ImageContentValidationError,
  validateImageContent,
} from '@/lib/storage/imageValidation';

export const EVENT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
// One cover plus up to four gallery rows forms the single five-image poster
// collection exposed by the clients.
export const EVENT_MEDIA_MAX_GALLERY_ITEMS = 4;

export type EventMediaRole = 'cover' | 'gallery';

export type EventMediaFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

export type ValidatedEventMedia = {
  file: EventMediaFile;
  role: EventMediaRole;
  displayOrder: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export class EventMediaValidationError extends Error {
  constructor(
    public readonly code:
      | 'MEDIA_FILE_MISSING'
      | 'MEDIA_FILE_TOO_LARGE'
      | 'MEDIA_FILE_TYPE_NOT_ALLOWED'
      | 'MEDIA_FILE_CONTENT_INVALID'
      | 'MEDIA_FILE_DIMENSIONS_INVALID'
      | 'MEDIA_GALLERY_REPLACE_REQUIRED'
      | 'MEDIA_GALLERY_LIMIT_EXCEEDED'
      | 'MEDIA_GALLERY_UNKNOWN_ITEM',
    public readonly status: 400 | 413 | 415 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'EventMediaValidationError';
  }
}

function friendlyFileName(file: EventMediaFile): string {
  return file.name.trim() || 'berkas';
}

async function validateOne(
  file: EventMediaFile,
  role: EventMediaRole,
  displayOrder: number,
): Promise<ValidatedEventMedia> {
  if (file.size > EVENT_MEDIA_MAX_BYTES) {
    throw new EventMediaValidationError(
      'MEDIA_FILE_TOO_LARGE',
      413,
      `Ukuran ${friendlyFileName(file)} melebihi batas 5 MB.`,
    );
  }

  try {
    const image = await validateImageContent(Buffer.from(await file.arrayBuffer()));
    return {
      file,
      role,
      displayOrder,
      mimeType: image.mimeType,
    };
  } catch (error) {
    if (!(error instanceof ImageContentValidationError)) throw error;
    if (error.kind === 'dimensions') {
      throw new EventMediaValidationError(
        'MEDIA_FILE_DIMENSIONS_INVALID',
        422,
        `Dimensi ${friendlyFileName(file)} terlalu besar. Maksimal 8192 px per sisi dan 20 megapiksel.`,
      );
    }
    if (error.kind === 'content') {
      throw new EventMediaValidationError(
        'MEDIA_FILE_CONTENT_INVALID',
        415,
        `Isi ${friendlyFileName(file)} bukan gambar yang valid.`,
      );
    }
    throw new EventMediaValidationError(
      'MEDIA_FILE_TYPE_NOT_ALLOWED',
      415,
      `Format ${friendlyFileName(file)} tidak didukung. Gunakan JPG, PNG, atau WebP.`,
    );
  }
}

export async function validateEventMediaFiles({
  cover,
  gallery,
}: {
  cover: EventMediaFile;
  gallery: EventMediaFile[];
}): Promise<ValidatedEventMedia[]> {
  if (!cover) {
    throw new EventMediaValidationError(
      'MEDIA_FILE_MISSING',
      400,
      'Poster acara wajib diunggah.',
    );
  }

  if (gallery.length > EVENT_MEDIA_MAX_GALLERY_ITEMS) {
    throw new EventMediaValidationError(
      'MEDIA_GALLERY_LIMIT_EXCEEDED',
      422,
      'Maksimal 5 poster acara, termasuk poster utama.',
    );
  }

  const result = [await validateOne(cover, 'cover', 0)];
  for (const [displayOrder, file] of gallery.entries()) {
    result.push(await validateOne(file, 'gallery', displayOrder));
  }
  return result;
}

export async function validateEventGalleryFiles(
  gallery: EventMediaFile[],
): Promise<ValidatedEventMedia[]> {
  if (gallery.length > EVENT_MEDIA_MAX_GALLERY_ITEMS) {
    throw new EventMediaValidationError(
      'MEDIA_GALLERY_LIMIT_EXCEEDED',
      422,
      'Maksimal 5 poster acara, termasuk poster utama.',
    );
  }

  return Promise.all(
    gallery.map((file, displayOrder) => validateOne(file, 'gallery', displayOrder)),
  );
}
