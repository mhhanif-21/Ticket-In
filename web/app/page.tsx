import Link from 'next/link';
import { AdaptiveImage } from '@/components/media/AdaptiveImage';
import { getPublicEventsAction } from '@/lib/actions/getPublicEventsAction';

// The event catalog depends on the Preview/production database and must not
// query the local fallback database during `next build`.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const events = await getPublicEventsAction();

  return (
    <main className="min-h-screen bg-background text-on-background">
      <section className="border-b border-outline-variant bg-surface px-margin-mobile py-16 md:px-margin-desktop md:py-24">
        <div className="mx-auto max-w-[1200px]">
          <p className="font-label-caps text-label-caps uppercase tracking-[0.2em] text-secondary">
            Ticket-In
          </p>
          <h1 className="mt-4 max-w-3xl font-display-lg-mobile text-display-lg-mobile text-primary md:font-display-lg md:text-display-lg">
            Find events and secure your ticket.
          </h1>
          <p className="mt-6 max-w-2xl font-body-lg text-body-lg text-on-surface-variant">
            Ticket-In helps you find available events, register easily,
            and access digital tickets in one place.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-margin-mobile py-12 md:px-margin-desktop md:py-16">
        <div className="mb-8">
          <p className="font-label-caps text-label-caps uppercase tracking-[0.16em] text-secondary">
            Available events
          </p>
          <h2 className="mt-2 font-headline-md text-headline-md text-primary">Choose your favorite event</h2>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
            <h3 className="font-headline-md text-headline-md text-primary">No events available</h3>
            <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
              New events will appear on this page after being published by the organizer.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Link
                key={event.slug}
                href={`/${event.slug}`}
                className="group overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-transform duration-150 hover:-translate-y-1"
              >
                {event.posterUrl ? (
                  <AdaptiveImage
                    src={event.posterUrl}
                    alt={event.name}
                    frameAspectRatio={16 / 9}
                    blurredBackdrop
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    containerClassName="bg-surface-container-highest"
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-surface-container-highest px-6 text-center font-headline-md text-headline-md text-secondary">
                    {event.name}
                  </div>
                )}
                <div className="p-6">
                  <h3 className="font-headline-md text-headline-md text-primary">{event.name}</h3>
                  <p className="mt-2 line-clamp-2 font-body-md text-body-md text-on-surface-variant">
                    {event.description || 'View event details and registration information.'}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-4 font-description text-description text-secondary">
                    <span>{event.location}</span>
                    <span className="font-semibold text-primary">View event →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
