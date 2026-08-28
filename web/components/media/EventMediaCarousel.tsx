'use client';

import { useRef, useState } from 'react';

import { AdaptiveImage } from '@/components/media/AdaptiveImage';

export type PublicEventMedia = {
  role: string;
  displayOrder: number;
  publicUrl: string;
};

type EventMediaCarouselProps = {
  eventName: string;
  media: PublicEventMedia[];
};

const SWIPE_THRESHOLD_PX = 40;

export function EventMediaCarousel({ eventName, media }: EventMediaCarouselProps) {
  const images = media.filter((item) => item.publicUrl.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);

  if (images.length === 0) return null;

  const goTo = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, images.length - 1)));
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
      className="w-full overflow-hidden bg-surface-container-highest shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
    >
      <div
        className="relative touch-pan-y select-none cursor-grab active:cursor-grabbing"
        onPointerDown={(event) => {
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
          sizes="100vw"
          fallbackAspectRatio={16 / 9}
          fit="contain"
          blurredBackdrop={false}
          containerClassName="w-full bg-surface-container-highest"
          imageClassName="p-2 sm:p-4"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-3 sm:p-4" aria-label="Pilih media acara">
          {images.map((item, index) => (
            <button
              key={`${item.role}-${item.displayOrder}-${item.publicUrl}`}
              type="button"
              aria-label={`Tampilkan gambar ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
              className={`w-20 shrink-0 overflow-hidden rounded-lg ring-offset-2 transition focus:outline-none focus:ring-2 focus:ring-primary ${index === activeIndex ? 'ring-2 ring-primary' : 'opacity-75 hover:opacity-100'}`}
            >
              <AdaptiveImage
                src={item.publicUrl}
                alt=""
                sizes="80px"
                frameAspectRatio={4 / 3}
                fit="contain"
                containerClassName="w-full bg-surface-container-highest"
              />
            </button>
          ))}
        </div>
      )}

      <p className="px-4 pb-3 text-center text-xs text-secondary" aria-live="polite">
        {activeIndex + 1} / {images.length}
      </p>
    </section>
  );
}
