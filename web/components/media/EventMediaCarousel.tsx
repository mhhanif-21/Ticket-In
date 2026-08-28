'use client';

import { useRef, useState } from 'react';

import { AdaptiveImage } from '@/components/media/AdaptiveImage';
import { getPosterAspectRatio } from '@/lib/events/posterAspect';

export type PublicEventMedia = {
  role: string;
  displayOrder: number;
  publicUrl: string;
};

type EventMediaCarouselProps = {
  eventName: string;
  media: PublicEventMedia[];
  posterAspectMode?: string | null;
};

const SWIPE_THRESHOLD_PX = 40;

export function EventMediaCarousel({ eventName, media, posterAspectMode }: EventMediaCarouselProps) {
  const images = media.filter((item) => item.publicUrl.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const aspectRatio = getPosterAspectRatio(posterAspectMode);

  if (images.length === 0) return null;

  const goTo = (index: number) => {
    setActiveIndex((index + images.length) % images.length);
  };

  const handlePointerEnd = (endX: number | undefined) => {
    const startX = pointerStartX.current;
    pointerStartX.current = null;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < SWIPE_THRESHOLD_PX) return;
    goTo(activeIndex + (endX < startX ? 1 : -1));
  };

  return (
    <section
      aria-label={`Media acara ${eventName}`}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-[16px] bg-surface-container-highest shadow-[0_4px_12px_rgba(0,0,0,0.05)] touch-pan-y select-none cursor-grab active:cursor-grabbing ${posterAspectMode === 'portrait' ? 'max-w-xl' : posterAspectMode === 'banner' ? 'max-w-6xl' : 'max-w-5xl'}`}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('button')) return;
          pointerStartX.current = event.clientX;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => handlePointerEnd(event.clientX)}
        onPointerCancel={() => handlePointerEnd(undefined)}
      >
        <AdaptiveImage
          key={images[activeIndex].publicUrl}
          src={images[activeIndex].publicUrl}
          alt={`${eventName} - gambar ${activeIndex + 1}`}
          priority={activeIndex === 0}
          sizes="(max-width: 768px) 100vw, 1200px"
          frameAspectRatio={aspectRatio}
          fit="contain"
          blurredBackdrop={false}
          containerClassName="w-full bg-surface-container-highest"
          imageClassName="p-0"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Gambar sebelumnya"
              onClick={() => goTo(activeIndex - 1)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-2xl leading-none text-white transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white md:block"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Gambar berikutnya"
              onClick={() => goTo(activeIndex + 1)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-2xl leading-none text-white transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white md:block"
            >
              ›
            </button>
          </>
        )}
        <p className="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white" aria-live="polite">
          {activeIndex + 1} / {images.length}
        </p>
      </div>
    </section>
  );
}
