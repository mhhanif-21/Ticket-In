export const EVENT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_MEDIA_MAX_GALLERY_ITEMS = 5;

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
      | 'MEDIA_GALLERY_LIMIT_EXCEEDED',
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

async function detectMimeType(file: EventMediaFile): Promise<ValidatedEventMedia['mimeType']> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return 'image/jpeg';

  const isPng = bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
  if (isPng) return 'image/png';

  const isWebp = bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
  if (isWebp) return 'image/webp';

  throw new EventMediaValidationError(
    'MEDIA_FILE_TYPE_NOT_ALLOWED',
    415,
    `Format ${friendlyFileName(file)} tidak didukung. Gunakan JPG, PNG, atau WebP.`,
  );
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

  return {
    file,
    role,
    displayOrder,
    mimeType: await detectMimeType(file),
  };
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
      'Maksimal 5 foto galeri per acara.',
    );
  }

  const result = [await validateOne(cover, 'cover', 0)];
  for (const [displayOrder, file] of gallery.entries()) {
    result.push(await validateOne(file, 'gallery', displayOrder));
  }
  return result;
}
