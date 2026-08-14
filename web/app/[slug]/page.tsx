import { notFound } from 'next/navigation';
import { getPublicEventAction } from '@/lib/actions/getPublicEventAction';
import Link from 'next/link';
import Image from 'next/image';

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
      {/* Hero Event Poster (16:9 Aspect Ratio) */}
      <div className="w-full aspect-[16/9] relative overflow-hidden bg-surface-container-highest shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        {event.posterUrl ? (
          <Image src={event.posterUrl} alt={event.name} fill className="object-cover" unoptimized={process.env.NODE_ENV === 'development'} />
        ) : (
          <div className="flex items-center justify-center w-full h-full absolute inset-0">
             <span className="text-secondary text-2xl font-bold opacity-80 px-4 text-center">{event.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent"></div>
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
            <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary leading-tight">
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
             <div className="w-full bg-surface-container-highest text-on-surface hover:bg-surface-variant rounded-[10px] py-4 px-6 font-body-md text-body-md font-semibold flex items-center justify-center gap-2">
               Pendaftaran Ditutup (Kuota Penuh)
             </div>
          ) : (
            <Link href={`/${params.slug}/register`} className="btn-interact w-full bg-primary text-on-primary hover:bg-inverse-surface rounded-[10px] py-4 px-6 font-body-md text-body-md font-semibold flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              Daftar Sekarang
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          )}
          <Link href={`/${params.slug}/status`} className="btn-interact w-full bg-transparent text-primary border border-primary hover:bg-surface-container-low rounded-[10px] py-4 px-6 font-body-md text-body-md font-medium flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            {event.registrationMode === 'Manual Review' ? 'Cek Status / Belum dapat email OTP?' : 'Sudah Daftar? Cek Tiket'}
          </Link>
        </div>
      </div>
    </main>
  );
}
