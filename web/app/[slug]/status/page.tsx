'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

export default function StatusCheckPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;

  const initialName = searchParams.get('name') || '';
  const initialEmail = searchParams.get('email') || '';
  const [isJustRegistered, setIsJustRegistered] = useState(searchParams.get('registered') === 'true');

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ticketData, setTicketData] = useState<any>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'processing' | 'completed'>('idle');

  // Submit form
  const checkStatus = async (e?: React.FormEvent, checkName?: string, checkEmail?: string) => {
    if (e) e.preventDefault();

    const targetName = checkName || name;
    const targetEmail = checkEmail || email;

    if (!targetName || !targetEmail) return;

    setLoading(true);
    setError('');
    setTicketData(null);
    setPollingStatus('idle');

    try {
      const res = await fetch(`/api/v1/registration/status?event_slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(targetName)}&email=${encodeURIComponent(targetEmail)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Gagal mengecek status');
      } else {
        setTicketData(data.data);
        if (data.data.status === 'Accepted' && !data.data.qr_code_url) {
          setPollingStatus('processing');
        } else if (data.data.status === 'Accepted' && data.data.qr_code_url) {
          setPollingStatus('completed');
        }
      }
    } catch (err) {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
      // Remove query parameters from URL without reloading the page
      if (isJustRegistered) {
        router.replace(`/${slug}/status`);
      }
    }
  };

  useEffect(() => {
    if (isJustRegistered && initialName && initialEmail) {
      checkStatus(undefined, initialName, initialEmail);
    }
  }, [isJustRegistered, initialName, initialEmail]);

  // Polling effect
  useEffect(() => {
    let interval: any;
    if (pollingStatus === 'processing' && ticketData?.id) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/v1/registration/${ticketData.id}/status`);
          const data = await res.json();
          if (data.status === 'completed') {
            setTicketData((prev: any) => ({
              ...prev,
              qr_code_url: data.qr_code_url,
              ticket_code: data.ticket_code
            }));
            setPollingStatus('completed');
            clearInterval(interval);
          }
        } catch (err) {
          // just retry on next interval
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pollingStatus, ticketData?.id]);

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center opacity-[0.03]">
        <div className="w-[800px] h-[800px] rounded-full border border-primary absolute -top-[400px]"></div>
        <div className="w-[1200px] h-[1200px] rounded-full border border-primary absolute -top-[600px]"></div>
      </div>

      <div className="w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-stack-lg md:p-[64px] flex flex-col gap-stack-lg relative z-10">

        <div className="flex flex-col gap-stack-sm text-center items-center">
          <span className={`material-symbols-outlined mb-2 text-4xl ${isJustRegistered && ticketData?.status === 'Accepted' ? 'text-green-600' : 'text-primary'}`}>
            {isJustRegistered && ticketData?.status === 'Accepted' ? 'check_circle' : (ticketData ? 'confirmation_number' : 'search')}
          </span>
          <h2 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary">
            {!ticketData
              ? (isJustRegistered ? 'Memuat Status...' : 'Cek Status Tiket')
              : (isJustRegistered
                  ? (ticketData.status === 'Accepted' ? 'Pendaftaran Berhasil!' : 'Pendaftaran Terkirim!')
                  : 'Status Tiket Anda')}
          </h2>

          {!ticketData && (
            <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[400px]">
              {isJustRegistered ? 'Sedang memuat status pendaftaran Anda...' : 'Masukkan nama dan email yang Anda gunakan saat mendaftar.'}
            </p>
          )}

          {ticketData && isJustRegistered && (
            <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[400px]">
              {ticketData.status === 'Accepted'
                ? 'Berikut adalah tiket untuk pendaftaran Anda.'
                : 'Formulir Anda telah kami terima dengan baik.'}
            </p>
          )}

          {ticketData && !isJustRegistered && (
            <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[400px]">
              Menampilkan status pendaftaran terkini Anda.
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 bg-error-container text-on-error-container rounded-lg font-medium text-center">
            {error}
          </div>
        )}

        {!ticketData ? (
          <form onSubmit={checkStatus} className="flex flex-col gap-stack-md mt-4">
            <div className="flex flex-col gap-stack-sm group">
              <label className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">Nama Lengkap</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline transition-all duration-200 outline-none hover:border-primary-container"
                  placeholder="Contoh: John Doe"
                />
              </div>
            </div>

            <div className="flex flex-col gap-stack-sm group">
              <label className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline transition-all duration-200 outline-none hover:border-primary-container"
                  placeholder="Contoh: john@example.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-stack-md w-full bg-primary text-on-primary font-body-md text-body-md py-4 rounded-lg hover:opacity-90 active:scale-[0.96] transition-all duration-150 flex items-center justify-center font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Memeriksa...' : 'Cari Tiket Saya'}
              {!loading && <span className="material-symbols-outlined ml-2 text-[20px]">arrow_forward</span>}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-stack-lg w-full">
            {ticketData.status === 'Draft' ? (
              <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
                <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[32px]">mark_email_unread</span>
                </div>
                <div>
                  <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Menunggu Verifikasi OTP</h3>
                  <p className="font-description text-description text-on-surface-variant">Pendaftaran belum selesai. Silakan cek email Anda untuk kode OTP dan masukkan di sini untuk melanjutkan.</p>
                </div>
              </section>
            ) : ticketData.status === 'Pending' ? (
              <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
                <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-primary animate-pulse">
                  <span className="material-symbols-outlined text-[32px]">hourglass_empty</span>
                </div>
                <div>
                  <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">
                    {isJustRegistered ? 'Segera Direview' : 'Sedang Direview'}
                  </h3>
                  <p className="font-description text-description text-on-surface-variant">
                    {isJustRegistered
                      ? 'Pendaftaran Anda telah berhasil dikirim dan akan segera ditinjau oleh panitia.'
                      : 'Pendaftaran Anda sedang ditinjau oleh panitia. Silakan cek kembali halaman ini secara berkala.'}
                  </p>
                </div>
              </section>
            ) : ticketData.status === 'Rejected' ? (
              <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant opacity-75">
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px]">close</span>
                </div>
                <div>
                  <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Pendaftaran Ditolak</h3>
                  <p className="font-description text-description text-on-surface-variant">Mohon maaf, pendaftaran Anda tidak dapat disetujui untuk acara ini.</p>
                </div>
              </section>
            ) : ticketData.status === 'Accepted' && pollingStatus === 'processing' ? (
              <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <div>
                  <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Sedang Menerbitkan Tiket</h3>
                  <p className="font-description text-description text-on-surface-variant">Sistem sedang men-generate QR Code unik Anda. Mohon tunggu...</p>
                </div>
              </section>
            ) : ticketData.status === 'Accepted' && pollingStatus === 'completed' ? (
              <section className="mt-stack-lg">
                <div className="text-center mb-stack-md">
                  <span className="inline-block px-4 py-1 rounded-full bg-primary text-on-primary font-label-caps text-label-caps mb-stack-sm">Pendaftaran Berhasil</span>
                  <p className="font-description text-description text-on-surface-variant">Tiket Anda telah aktif. Tunjukkan QR Code ini kepada panitia saat acara.</p>
                </div>
                {/* Ticket Card */}
                <div className="w-full max-w-sm mx-auto drop-shadow-xl">
                  {/* Top Half */}
                  <div className="bg-surface-container-lowest rounded-t-[16px] p-stack-lg relative border border-b-0 border-surface-variant overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-surface-container rounded-bl-full -mr-16 -mt-16 opacity-50"></div>
                    <div className="relative z-10 flex flex-col items-center text-center gap-stack-sm">
                      <span className="material-symbols-outlined text-[48px] text-primary mb-2">confirmation_number</span>
                      <h4 className="font-headline-md text-headline-md text-primary font-bold leading-tight">{ticketData.ticket_code}</h4>
                      <p className="font-body-md text-body-md text-on-surface-variant">Admit One</p>
                      <div className="mt-stack-md w-full bg-surface-container py-3 rounded-lg border border-surface-variant">
                        <p className="font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase tracking-wider">Participant</p>
                        <p className="font-body-lg text-body-lg text-primary font-bold">{ticketData.name}</p>
                      </div>
                    </div>
                  </div>
                  {/* Divider line */}
                  <div className="w-full h-px border-t border-dashed border-surface-variant relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface rounded-full -ml-3 border-r border-surface-variant z-20"></div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface rounded-full -mr-3 border-l border-surface-variant z-20"></div>
                  </div>
                  {/* Bottom Half */}
                  <div className="bg-surface-container-lowest rounded-b-[16px] p-stack-lg relative border border-t-0 border-surface-variant flex flex-col items-center">
                    <div className="w-full mb-stack-md flex flex-col items-center">
                      <img src={ticketData.qr_code_url} alt="QR Code" className="w-48 h-auto rounded-lg border border-surface-variant p-2 bg-surface-container" />
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(ticketData.qr_code_url);
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `Tiket-${slug}-${ticketData.ticket_code}.png`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('Failed to download image', err);
                          // Fallback
                          window.open(ticketData.qr_code_url, '_blank');
                        }
                      }}
                      className="flex items-center gap-2 px-6 py-2 rounded-full border border-primary text-primary font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-colors duration-150 active:scale-95 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      Download QR Code
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {!isJustRegistered && (
              <button
                onClick={() => {
                  setTicketData(null);
                  setIsJustRegistered(false);
                }}
                className="mt-4 w-full bg-transparent border border-outline-variant text-on-surface hover:bg-surface-container-lowest font-body-md text-body-md py-4 rounded-lg shadow-sm transition-colors"
              >
                Cek Tiket Lain
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
