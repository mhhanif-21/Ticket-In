import Image from 'next/image';
import Link from 'next/link';
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
            Temukan event dan amankan tiketmu.
          </h1>
          <p className="mt-6 max-w-2xl font-body-lg text-body-lg text-on-surface-variant">
            Ticket-In membantu kamu menemukan event yang sedang tersedia, mendaftar dengan mudah,
            dan mengakses tiket digital di satu tempat.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-margin-mobile py-12 md:px-margin-desktop md:py-16">
        <div className="mb-8">
          <p className="font-label-caps text-label-caps uppercase tracking-[0.16em] text-secondary">
            Event tersedia
          </p>
          <h2 className="mt-2 font-headline-md text-headline-md text-primary">Pilih event favoritmu</h2>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
            <h3 className="font-headline-md text-headline-md text-primary">Belum ada event tersedia</h3>
            <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
              Event baru akan tampil di halaman ini setelah dipublikasikan oleh panitia.
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
                <div className="relative aspect-[16/9] overflow-hidden bg-surface-container-highest">
                  {event.posterUrl ? (
                    <Image
                      src={event.posterUrl}
                      alt={event.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center font-headline-md text-headline-md text-secondary">
                      {event.name}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-headline-md text-headline-md text-primary">{event.name}</h3>
                  <p className="mt-2 line-clamp-2 font-body-md text-body-md text-on-surface-variant">
                    {event.description || 'Lihat detail event dan informasi pendaftarannya.'}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-4 font-description text-description text-secondary">
                    <span>{event.location}</span>
                    <span className="font-semibold text-primary">Lihat event →</span>
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
