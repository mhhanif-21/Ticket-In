'use client';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  clearRegistrationResubmitState,
  loadRegistrationResubmitState,
  saveRegistrationResubmitState,
  type RegistrationResubmitState,
} from '@/lib/client/registrationResubmit';

export default function VerifyOtpPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;

  const regId = searchParams.get('regId');

  const [resubmitState, setResubmitState] = useState<RegistrationResubmitState | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!regId) {
      router.push(`/${slug}`);
      return;
    }

    const stored = loadRegistrationResubmitState(slug);
    if (!stored || stored.registrationId !== regId) {
      router.push(`/${slug}`);
      return;
    }
    setResubmitState(stored);
  }, [regId, slug, router]);

  const email = resubmitState?.email || '';
  const name = resubmitState?.name || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setError('Kode OTP harus 6 digit angka.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch(`/api/v1/registrations/${regId}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp_code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Gagal memverifikasi OTP');
      }

      // Success, redirect to status page
      clearRegistrationResubmitState(slug);
      const statusParams = new URLSearchParams({ email, name, registered: 'true' });
      router.push(`/${slug}/status?${statusParams.toString()}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!resubmitState) return;

    setResending(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.set('name', resubmitState.name);
      formData.set('email', resubmitState.email);
      formData.set('registration_id', resubmitState.registrationId);
      formData.set('resubmit_token', resubmitState.resubmitToken);
      formData.set('retry_only', 'true');

      const res = await fetch(`/api/v1/events/${slug}/register`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.data?.status === 'Draft' && data.data?.resubmitToken) {
          const rotatedState = { ...resubmitState, resubmitToken: data.data.resubmitToken };
          saveRegistrationResubmitState(slug, rotatedState);
          setResubmitState(rotatedState);
        }
        throw new Error(data.message || 'OTP belum dapat dikirim.');
      }

      if (data.data?.status !== 'Draft' || !data.data?.resubmitToken) {
        throw new Error('Bukti pengiriman OTP tidak tersedia.');
      }

      const rotatedState = { ...resubmitState, resubmitToken: data.data.resubmitToken };
      saveRegistrationResubmitState(slug, rotatedState);
      setResubmitState(rotatedState);
      setNotice('OTP baru telah dikirim.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  if (!regId || !resubmitState || resubmitState.registrationId !== regId) return null;

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center opacity-[0.03]">
        <div className="w-[800px] h-[800px] rounded-full border border-primary absolute -top-[400px]"></div>
        <div className="w-[1200px] h-[1200px] rounded-full border border-primary absolute -top-[600px]"></div>
      </div>

      <div className="w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-stack-lg md:p-[64px] flex flex-col gap-stack-lg relative z-10">

        <div className="flex flex-col gap-stack-sm text-center items-center">
          <span className="material-symbols-outlined text-primary mb-2 text-4xl">password</span>
          <h2 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary">Verifikasi Email</h2>
          <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[400px]">
            Masukkan 6 digit kode OTP yang telah dikirim ke <span className="font-semibold text-primary">{email}</span>.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-error-container text-on-error-container rounded-lg font-medium text-center">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-4 bg-primary-container/20 text-primary rounded-lg font-medium text-center">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md mt-4">
          <div className="flex flex-col gap-stack-sm group">
            <label className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider text-center">Kode OTP</label>
            <div className="relative">
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} // only digits
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-3 font-display-lg-mobile text-display-lg-mobile text-primary tracking-widest text-center placeholder:text-outline transition-all duration-200 outline-none hover:border-primary-container"
                placeholder="000000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="mt-stack-md w-full bg-primary text-on-primary font-body-md text-body-md py-4 rounded-lg hover:opacity-90 active:scale-[0.96] transition-all duration-150 flex items-center justify-center font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Memverifikasi...' : 'Verifikasi OTP'}
            {!loading && <span className="material-symbols-outlined ml-2 text-[20px]">check_circle</span>}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resending}
            className="w-full border border-primary text-primary font-body-md text-body-md py-3 rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {resending ? 'Mengirim ulang...' : 'Kirim ulang OTP'}
          </button>
          <Link
            href={`/${slug}/register?correction=1&registration_id=${encodeURIComponent(regId)}`}
            className="text-center font-body-md text-body-md text-primary hover:underline"
          >
            Ubah Email
          </Link>
          <Link href={`/${slug}`} className="mt-2 text-center font-body-md text-body-md text-secondary hover:text-primary transition-colors duration-150">
            Batalkan Pendaftaran
          </Link>
        </form>
      </div>
    </main>
  );
}
