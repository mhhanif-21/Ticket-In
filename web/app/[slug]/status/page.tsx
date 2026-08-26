'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  clearRegistrationStatusCapability,
  loadRegistrationStatusCapability,
} from '@/lib/client/registrationStatusCapability';

const POLLING_INTERVAL_MS = 3000;
const POLLING_TIMEOUT_MS = 60000;

type TicketData = {
  status: 'Draft' | 'Pending' | 'Accepted' | 'Rejected';
  ticket_code: string | null;
  qr_code_url: string | null;
  ticket_job_status: string | null;
};

export default function StatusCheckPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');

  const loadStatus = useCallback(async () => {
    const capability = loadRegistrationStatusCapability(slug);
    if (!capability) {
      setTicketData(null);
      setPollingStatus('failed');
      setError('Akses status tidak tersedia atau sudah kedaluwarsa. Tiket yang telah disetujui dikirim melalui email.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/registration/status', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${capability.token}` },
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearRegistrationStatusCapability(slug);
        }
        throw new Error(body.message || 'Gagal mengecek status');
      }

      const nextData = body.data as TicketData;
      setTicketData(nextData);
      if (nextData.status === 'Accepted' && nextData.ticket_job_status === 'failed') {
        setPollingStatus('failed');
        setError('Penerbitan tiket gagal. Silakan hubungi panitia.');
      } else if (nextData.status === 'Accepted' && nextData.qr_code_url && nextData.ticket_code) {
        setPollingStatus('completed');
      } else if (nextData.status === 'Accepted') {
        setPollingStatus('processing');
      } else {
        setPollingStatus('idle');
      }
    } catch (requestError) {
      setTicketData(null);
      setPollingStatus('failed');
      setError(requestError instanceof Error ? requestError.message : 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (pollingStatus !== 'processing') return;

    let stopped = false;
    const interval = window.setInterval(() => {
      if (!stopped) void loadStatus();
    }, POLLING_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(interval);
      setPollingStatus('failed');
      setError('Tiket belum selesai diterbitkan. Silakan cek email atau hubungi panitia.');
    }, POLLING_TIMEOUT_MS);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [loadStatus, pollingStatus]);

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center opacity-[0.03]">
        <div className="w-[800px] h-[800px] rounded-full border border-primary absolute -top-[400px]" />
        <div className="w-[1200px] h-[1200px] rounded-full border border-primary absolute -top-[600px]" />
      </div>

      <div className="w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-stack-lg md:p-[64px] flex flex-col gap-stack-lg relative z-10">
        <div className="flex flex-col gap-stack-sm text-center items-center">
          <span className="material-symbols-outlined mb-2 text-4xl text-primary">
            {loading ? 'progress_activity' : ticketData ? 'confirmation_number' : 'lock'}
          </span>
          <h2 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary">
            {loading ? 'Memuat Status...' : ticketData ? 'Status Pendaftaran' : 'Akses Status Tidak Tersedia'}
          </h2>
          <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[420px]">
            Status tiket hanya dapat dibuka dari sesi perangkat yang menyelesaikan pendaftaran. Nama dan email tidak digunakan sebagai bukti akses.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-error-container text-on-error-container rounded-lg font-medium text-center">
            {error}
          </div>
        )}

        {ticketData?.status === 'Draft' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
            <span className="material-symbols-outlined text-[32px] text-primary">mark_email_unread</span>
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Menunggu Verifikasi OTP</h3>
              <p className="font-description text-description text-on-surface-variant">Masukkan kode OTP dari email untuk melanjutkan pendaftaran.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Pending' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
            <span className="material-symbols-outlined text-[32px] text-primary animate-pulse">hourglass_empty</span>
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Sedang Direview</h3>
              <p className="font-description text-description text-on-surface-variant">Pendaftaran sedang ditinjau. Tiket akan dikirim melalui email setelah disetujui.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Rejected' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant opacity-75">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">close</span>
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Pendaftaran Ditolak</h3>
              <p className="font-description text-description text-on-surface-variant">Mohon maaf, pendaftaran tidak dapat disetujui untuk acara ini.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Accepted' && pollingStatus === 'processing' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Sedang Menerbitkan Tiket</h3>
              <p className="font-description text-description text-on-surface-variant">Sistem sedang menyiapkan QR Code unik Anda.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Accepted' && pollingStatus === 'completed' && ticketData.qr_code_url && ticketData.ticket_code && (
          <section className="mt-stack-lg">
            <div className="text-center mb-stack-md">
              <span className="inline-block px-4 py-1 rounded-full bg-primary text-on-primary font-label-caps text-label-caps mb-stack-sm">Pendaftaran Berhasil</span>
              <p className="font-description text-description text-on-surface-variant">Tunjukkan QR Code ini kepada panitia saat acara.</p>
            </div>
            <div className="w-full max-w-sm mx-auto drop-shadow-xl">
              <div className="bg-surface-container-lowest rounded-t-[16px] p-stack-lg relative border border-b-0 border-surface-variant overflow-hidden">
                <div className="relative z-10 flex flex-col items-center text-center gap-stack-sm">
                  <span className="material-symbols-outlined text-[48px] text-primary mb-2">confirmation_number</span>
                  <h4 className="font-headline-md text-headline-md text-primary font-bold leading-tight">{ticketData.ticket_code}</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">Tiket Anda</p>
                </div>
              </div>
              <div className="bg-surface-container-lowest rounded-b-[16px] p-stack-lg relative border border-t-0 border-surface-variant flex flex-col items-center">
                <img src={ticketData.qr_code_url} alt="QR Code tiket" className="w-48 h-auto rounded-lg border border-surface-variant p-2 bg-surface-container" />
                <button
                  onClick={() => window.open(ticketData.qr_code_url!, '_blank', 'noopener,noreferrer')}
                  className="mt-stack-md flex items-center gap-2 px-6 py-2 rounded-full border border-primary text-primary font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Buka QR Code
                </button>
              </div>
            </div>
          </section>
        )}

        {!loading && (!ticketData || pollingStatus === 'failed') && (
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="w-full border border-primary text-primary font-body-md text-body-md py-3 rounded-lg hover:bg-primary/10 transition-colors"
          >
            Coba Lagi
          </button>
        )}

        <Link href={`/${slug}`} className="text-center font-body-md text-body-md text-secondary hover:text-primary transition-colors">
          Kembali ke acara
        </Link>
      </div>
    </main>
  );
}
