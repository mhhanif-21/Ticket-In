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
      setError('Status access not available or expired. Approved tickets are sent via email.');
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
        throw new Error(body.message || 'Failed to check status');
      }

      const nextData = body.data as TicketData;
      setTicketData(nextData);
      if (nextData.status === 'Accepted' && nextData.ticket_job_status === 'failed') {
        setPollingStatus('failed');
        setError('Ticket issuance failed. Please contact the committee.');
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
      setError(requestError instanceof Error ? requestError.message : 'Network error occurred.');
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
      setError('Ticket issuance not complete. Please check your email or contact the committee.');
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
            {loading ? 'Loading Status...' : ticketData ? 'Registration Status' : 'Status Access Not Available'}
          </h2>
          <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant max-w-[420px]">
            Ticket status can only be opened from the device session that completed the registration. Name and email are not used as access proof.
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
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Awaiting OTP Verification</h3>
              <p className="font-description text-description text-on-surface-variant">Enter the OTP code from your email to continue registration.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Pending' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
            <span className="material-symbols-outlined text-[32px] text-primary animate-pulse">hourglass_empty</span>
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Under Review</h3>
              <p className="font-description text-description text-on-surface-variant">Registration is under review. Tickets will be sent via email once approved.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Rejected' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant opacity-75">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">close</span>
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Registration Rejected</h3>
              <p className="font-description text-description text-on-surface-variant">Sorry, registration cannot be approved for this event.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Accepted' && pollingStatus === 'processing' && (
          <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center gap-stack-md border border-surface-variant">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div>
              <h3 className="font-body-lg text-body-lg text-primary font-bold mb-stack-sm">Issuing Ticket</h3>
              <p className="font-description text-description text-on-surface-variant">The system is preparing your unique QR Code.</p>
            </div>
          </section>
        )}

        {ticketData?.status === 'Accepted' && pollingStatus === 'completed' && ticketData.qr_code_url && ticketData.ticket_code && (
          <section className="mt-stack-lg">
            <div className="text-center mb-stack-md">
              <span className="inline-block px-4 py-1 rounded-full bg-primary text-on-primary font-label-caps text-label-caps mb-stack-sm">Registration Successful</span>
              <p className="font-description text-description text-on-surface-variant">Show this QR Code to the committee at the event.</p>
            </div>
            <div className="w-full max-w-sm mx-auto drop-shadow-xl">
              <div className="bg-surface-container-lowest rounded-t-[16px] p-stack-lg relative border border-b-0 border-surface-variant overflow-hidden">
                <div className="relative z-10 flex flex-col items-center text-center gap-stack-sm">
                  <span className="material-symbols-outlined text-[48px] text-primary mb-2">confirmation_number</span>
                  <h4 className="font-headline-md text-headline-md text-primary font-bold leading-tight">{ticketData.ticket_code}</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">Your Ticket</p>
                </div>
              </div>
              <div className="bg-surface-container-lowest rounded-b-[16px] p-stack-lg relative border border-t-0 border-surface-variant flex flex-col items-center">
                <img src={ticketData.qr_code_url} alt="Ticket QR Code" className="w-48 h-auto rounded-lg border border-surface-variant p-2 bg-surface-container" />
                <button
                  onClick={() => window.open(ticketData.qr_code_url!, '_blank', 'noopener,noreferrer')}
                  className="mt-stack-md flex items-center gap-2 px-6 py-2 rounded-full border border-primary text-primary font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Open QR Code
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
            Try Again
          </button>
        )}

        <Link href={`/${slug}`} className="text-center font-body-md text-body-md text-secondary hover:text-primary transition-colors">
          Back to event
        </Link>
      </div>
    </main>
  );
}
