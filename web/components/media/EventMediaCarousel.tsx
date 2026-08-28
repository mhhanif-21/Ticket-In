'use client';

import { useState } from 'react';

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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  if (images.length === 0) return null;

  const goTo = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, images.length - 1)));
  };

  const goPrevious = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  return (
    <section
      aria-label={`Media acara ${eventName}`}
      className="w-full overflow-hidden bg-surface-container-highest shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
    >
      <div
        className="group relative touch-pan-y select-none"
        onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStartX === null) return;
          const endX = event.changedTouches[0]?.clientX;
          setTouchStartX(null);
          if (endX === undefined || Math.abs(endX - touchStartX) < SWIPE_THRESHOLD_PX) return;
          if (endX < touchStartX) goNext();
          else goPrevious();
        }}
      >
        <AdaptiveImage
          key={images[activeIndex].publicUrl}
          src={images[activeIndex].publicUrl}
          alt={`${eventName} - gambar ${activeIndex + 1}`}
          priority={activeIndex === 0}
          sizes="100vw"
          frameAspectRatio={16 / 9}
          fit="contain"
          blurredBackdrop
          containerClassName="w-full bg-surface-container-highest"
          imageClassName="p-2 sm:p-4"
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Media sebelumnya"
              onClick={goPrevious}
              disabled={activeIndex === 0}
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-xl text-white transition hover:bg-black/75 disabled:invisible md:inline-flex"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Media berikutnya"
              onClick={goNext}
              disabled={activeIndex === images.length - 1}
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-xl text-white transition hover:bg-black/75 disabled:invisible md:inline-flex"
            >
              ›
            </button>
          </>
        )}
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
