import { notFound } from 'next/navigation';
import { getPublicEventAction } from '@/lib/actions/getPublicEventAction';
import Link from 'next/link';
import { EventMediaCarousel } from '@/components/media/EventMediaCarousel';

export default async function PublicEventLandingPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const event = await getPublicEventAction(params.slug);

  if (!event) {
    notFound();
  }

  const dateStr = new Date(event.date).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="flex-grow w-full max-w-container-max mx-auto pb-stack-lg">
      {/* One responsive carousel for the cover and every stored gallery item. */}
      <div className="relative w-full overflow-hidden bg-surface-container-highest shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        {event.media.length > 0 ? (
          <EventMediaCarousel
            eventName={event.name}
            media={event.media}
            posterAspectMode={event.posterAspectMode}
          />
        ) : (
          <div className="flex min-h-56 items-center justify-center px-4 text-center text-2xl font-bold text-secondary opacity-80">
            {event.name}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />
      </div>

      {/* Event Details Container */}
      <div className="px-margin-mobile md:px-margin-desktop mt-stack-lg max-w-3xl mx-auto space-y-stack-lg">
        {/* Title & Core Info Card */}
        <div className="bg-surface-container-lowest dark:bg-[#1e1e1e] rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-6 md:p-8 space-y-stack-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
          <div className="space-y-stack-sm">
            <div className="inline-flex items-center px-3 py-1 bg-primary text-on-primary font-label-caps text-label-caps rounded-full uppercase tracking-wider mb-2">
              Event {event.registrationMode === 'Auto-Accept' ? 'Terbuka' : 'Premium'}
            </div>
            <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary dark:text-white leading-tight">
              {event.name}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md pt-4 border-t border-outline-variant/30">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary mt-0.5">calendar_today</span>
              <div>
                <p className="font-label-caps text-label-caps text-secondary dark:text-white/60 uppercase">Tanggal</p>
                <p className="font-body-md text-body-md text-on-surface dark:text-white font-medium mt-1">{dateStr}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary mt-0.5">group</span>
              <div>
                <p className="font-label-caps text-label-caps text-secondary dark:text-white/60 uppercase">Kuota</p>
                <p className="font-body-md text-body-md text-on-surface dark:text-white font-medium mt-1">
                   Tersisa {Math.max(0, event.capacity - event.currentCount)} / {event.capacity}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 md:col-span-2">
              <span className="material-symbols-outlined text-secondary mt-0.5">location_on</span>
              <div>
                <p className="font-label-caps text-label-caps text-secondary dark:text-white/60 uppercase">Lokasi</p>
                <p className="font-body-md text-body-md text-on-surface dark:text-white font-medium mt-1">{event.location}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Description Card */}
        <div className="bg-surface-container-lowest dark:bg-[#1e1e1e] rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-6 md:p-8 space-y-stack-sm">
          <h3 className="font-label-caps text-label-caps text-secondary dark:text-white/60 uppercase tracking-widest border-b border-outline-variant/30 dark:border-white/10 pb-2 mb-4">Tentang Acara</h3>
          <p className="font-body-lg text-body-lg text-on-surface-variant dark:text-white/80 leading-relaxed whitespace-pre-wrap">
            {event.description || 'Tidak ada deskripsi.'}
          </p>
        </div>

        {/* Call to Action Actions */}
        <div className="flex flex-col gap-stack-md pt-4">
          {event.isFull ? (
             <div className="w-full bg-surface-container-highest dark:bg-[#2a2a2a] text-on-surface dark:text-white hover:bg-surface-variant dark:hover:bg-[#333333] rounded-[10px] py-4 px-6 font-body-md text-body-md font-semibold flex items-center justify-center gap-2">
               Pendaftaran Ditutup (Kuota Penuh)
             </div>
          ) : (
            <Link href={`/${params.slug}/register`} className="btn-interact w-full bg-primary text-on-primary hover:bg-inverse-surface rounded-[10px] py-4 px-6 font-body-md text-body-md font-semibold flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              Daftar Sekarang
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          )}
          <Link href={`/${params.slug}/status`} className="btn-interact w-full bg-transparent text-primary dark:text-white border border-primary dark:border-white/70 hover:bg-surface-container-low dark:hover:bg-white/10 rounded-[10px] py-4 px-6 font-body-md text-body-md font-medium flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-white focus:ring-offset-2 dark:focus:ring-offset-[#0a0a0a]">
            {event.registrationMode === 'Manual Review' ? 'Cek Status / Belum dapat email OTP?' : 'Sudah Daftar? Cek Tiket'}
          </Link>
        </div>
      </div>
    </main>
  );
}
