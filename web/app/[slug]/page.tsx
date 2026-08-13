import { notFound } from 'next/navigation';
import { getPublicEventAction } from '@/lib/actions/getPublicEventAction';
import Link from 'next/link';

export default async function PublicEventLandingPage({ params }: { params: { slug: string } }) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* White-label Navigation (FR-REG-14) */}
      <header className="w-full bg-white border-b border-gray-200 py-4 px-6 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
            {event.name}
          </h1>
          <Link href={`/${params.slug}/status`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Cek Tiket Saya
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-6 md:py-12 flex flex-col md:flex-row gap-8">
        
        {/* Left Column: Poster & Details */}
        <div className="flex-1 space-y-6">
          <div className="w-full aspect-[4/3] bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-xl shadow-md overflow-hidden flex items-center justify-center relative">
            {event.posterUrl ? (
              <img src={event.posterUrl} alt={event.name} className="object-cover w-full h-full" />
            ) : (
              <span className="text-white text-2xl font-bold opacity-80 px-4 text-center">{event.name}</span>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Tentang Acara</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
              {event.description || 'Tidak ada deskripsi.'}
            </p>
          </div>
        </div>

        {/* Right Column: Floating Action Card */}
        <div className="w-full md:w-80 shrink-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Informasi Pelaksanaan</h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <div>
                  <p className="text-sm font-medium text-gray-900">Tanggal</p>
                  <p className="text-sm text-gray-600">{dateStr}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <div>
                  <p className="text-sm font-medium text-gray-900">Lokasi</p>
                  <p className="text-sm text-gray-600">{event.location}</p>
                </div>
              </div>
            </div>

            {event.isFull ? (
              <div className="w-full text-center p-3 rounded-lg bg-gray-100 border border-gray-200 text-gray-500 font-medium">
                Pendaftaran Ditutup (Kuota Penuh)
              </div>
            ) : (
              <Link 
                href={`/${params.slug}/register`}
                className="w-full block text-center p-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
              >
                Daftar Sekarang
              </Link>
            )}
            
            <p className="text-xs text-center text-gray-400 mt-4">
              Kuota tersisa: {Math.max(0, event.capacity - event.currentCount)} / {event.capacity}
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
