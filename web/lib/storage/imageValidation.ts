import sharp from 'sharp';

export const MAX_IMAGE_DIMENSION = 8_192;
export const MAX_IMAGE_PIXELS = 20_000_000;

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export class ImageContentValidationError extends Error {
  constructor(
    readonly kind: 'type' | 'content' | 'dimensions',
  ) {
    super(kind);
    this.name = 'ImageContentValidationError';
  }
}

export function detectSupportedImageMime(bytes: Uint8Array): SupportedImageMime | null {
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

  return null;
}

/**
 * A valid magic header is insufficient: Sharp verifies the encoded image,
 * applies a pixel safety ceiling while parsing, and exposes real dimensions.
 */
export async function validateImageContent(bytes: Buffer): Promise<{
  mimeType: SupportedImageMime;
  width: number;
  height: number;
}> {
  const mimeType = detectSupportedImageMime(bytes);
  if (!mimeType) throw new ImageContentValidationError('type');

  try {
    const metadata = await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) throw new ImageContentValidationError('content');
    if (
      width > MAX_IMAGE_DIMENSION
      || height > MAX_IMAGE_DIMENSION
      || width * height > MAX_IMAGE_PIXELS
    ) {
      throw new ImageContentValidationError('dimensions');
    }
    return { mimeType, width, height };
  } catch (error) {
    if (error instanceof ImageContentValidationError) throw error;
    throw new ImageContentValidationError('content');
  }
}
