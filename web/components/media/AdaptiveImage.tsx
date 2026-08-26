'use client';

import Image from 'next/image';
import { useEffect, useState, type SyntheticEvent } from 'react';

export type AdaptiveImageFit = 'contain' | 'cover';

interface AdaptiveImageProps {
  src: string;
  alt: string;
  containerClassName?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  unoptimized?: boolean;
  fit?: AdaptiveImageFit;
  /**
   * Set this only for a deliberately fixed visual frame (for example a
   * thumbnail card). The foreground image remains fully contained.
   */
  frameAspectRatio?: number;
  fallbackAspectRatio?: number;
  blurredBackdrop?: boolean;
}

export function getImageAspectRatio(
  width: number,
  height: number,
  fallback = 16 / 9,
): number {
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? width / height
    : fallback;
}

export function AdaptiveImage({
  src,
  alt,
  containerClassName = '',
  imageClassName = '',
  sizes = '100vw',
  priority = false,
  unoptimized = false,
  fit = 'contain',
  frameAspectRatio,
  fallbackAspectRatio = 16 / 9,
  blurredBackdrop = false,
}: AdaptiveImageProps) {
  const [intrinsicAspectRatio, setIntrinsicAspectRatio] = useState<number | null>(null);
  const isFixedFrame = frameAspectRatio !== undefined;
  const aspectRatio = isFixedFrame
    ? frameAspectRatio
    : intrinsicAspectRatio ?? fallbackAspectRatio;

  useEffect(() => {
    setIntrinsicAspectRatio(null);
  }, [src]);

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (isFixedFrame) return;

    const { naturalWidth, naturalHeight } = event.currentTarget;
    setIntrinsicAspectRatio(getImageAspectRatio(naturalWidth, naturalHeight, fallbackAspectRatio));
  }

  const fitClassName = fit === 'cover' ? 'object-cover' : 'object-contain';

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`}
      style={{ aspectRatio }}
    >
      {blurredBackdrop && (
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes}
          unoptimized={unoptimized}
          className="scale-110 object-cover blur-2xl opacity-40"
        />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={unoptimized}
        onLoad={handleLoad}
        className={`relative ${fitClassName} ${imageClassName}`}
      />
    </div>
  );
}
