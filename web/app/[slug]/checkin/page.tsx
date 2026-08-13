'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QrCode, User, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function CheckInLoginPage() {
  const params = useParams();
  const router = useRouter();
  const eventSlug = params.slug as string;

  const [volunteerName, setVolunteerName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volunteerName.trim() || !pin.trim()) {
      setError('Nama dan PIN wajib diisi');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/auth/volunteer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_slug: eventSlug,
          pin,
          volunteer_name: volunteerName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login gagal, periksa PIN Anda');
      }

      if (data.data?.access_token) {
        router.push(`/${eventSlug}/checkin/scan`);
      } else {
        throw new Error('Token tidak diterima dari server');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center p-margin-mobile md:p-margin-desktop">
        <div className="w-full max-w-[600px] bg-surface-container-lowest dark:bg-primary custom-shadow rounded-[16px] p-margin-mobile md:p-stack-lg border dark:border-on-primary/20">
          <div className="text-center mb-stack-lg">
            <h2 className="font-display-lg-mobile text-display-lg-mobile text-primary dark:text-on-primary mb-stack-sm md:font-display-lg md:text-display-lg">Portal Panitia</h2>
            <p className="font-body-md text-body-md text-on-surface-variant dark:text-on-primary/70">Akses khusus relawan dan staf acara.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-on-surface dark:text-on-primary uppercase" htmlFor="eventSlug">Event Slug</label>
              <div className="relative">
                <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" aria-hidden="true" />
                <input
                  className="w-full pl-10 pr-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none input-border font-body-md text-body-md placeholder-on-surface-variant disabled:opacity-50 dark:bg-primary dark:border-on-primary/30 dark:text-on-primary dark:placeholder-on-primary/50 dark:focus:ring-on-primary"
                  id="eventSlug"
                  name="eventSlug"
                  value={eventSlug}
                  disabled
                  type="text"
                />
              </div>
            </div>

            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-on-surface dark:text-on-primary uppercase" htmlFor="volunteerName">Nama Relawan</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" aria-hidden="true" />
                <input
                  className="w-full pl-10 pr-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none input-border font-body-md text-body-md placeholder-on-surface-variant disabled:opacity-50 dark:bg-primary dark:border-on-primary/30 dark:text-on-primary dark:placeholder-on-primary/50 dark:focus:ring-on-primary"
                  id="volunteerName"
                  name="volunteerName"
                  placeholder="Masukkan nama lengkap Anda"
                  required
                  type="text"
                  value={volunteerName}
                  onChange={(e) => setVolunteerName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-on-surface dark:text-on-primary uppercase" htmlFor="pin">PIN Panitia</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" aria-hidden="true" />
                <input
                  className="w-full pl-10 pr-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none input-border font-body-md text-body-md placeholder-on-surface-variant tracking-[0.2em] disabled:opacity-50 dark:bg-primary dark:border-on-primary/30 dark:text-on-primary dark:placeholder-on-primary/50 dark:focus:ring-on-primary"
                  id="pin"
                  inputMode="numeric"
                  name="pin"
                  placeholder="••••••"
                  required
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="text-error font-body-md text-sm mt-1">
                {error}
              </div>
            )}

            <div className="mt-stack-sm">
              <button
                className="w-full bg-primary text-on-primary dark:bg-on-primary dark:text-primary py-4 px-6 rounded-[10px] font-body-md text-body-md font-semibold flex items-center justify-center gap-2 btn-interact disabled:opacity-70"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  <>
                    Masuk
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
    </main>
  );
}
