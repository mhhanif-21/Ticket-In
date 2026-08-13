'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Keyboard, ArrowLeft, Send, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ManualCheckInPage() {
  const params = useParams();
  const eventSlug = params.slug as string;

  const [ticketCode, setTicketCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Status of the last scan
  const [scanResult, setScanResult] = useState<{
    status: 'idle' | 'success' | 'duplicate' | 'invalid';
    message: string;
    details?: string;
  }>({ status: 'idle', message: '' });

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount and after submission
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketCode.trim() || ticketCode.length < 8) return;

    setLoading(true);
    setScanResult({ status: 'idle', message: '' });

    try {
      const res = await fetch('/api/v1/checkin/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          ticket_code: ticketCode,
          scan_method: 'Manual'
        })
      });

      const data = await res.json();

      if (res.status === 200) {
        setScanResult({
          status: 'success',
          message: 'Check-in Berhasil',
          details: `${data.data.participant_name} - ${data.data.ticket_code}`
        });
      } else if (res.status === 409) {
        const firstScan = new Date(data.data.first_scanned_at).toLocaleString('id-ID');
        setScanResult({
          status: 'duplicate',
          message: 'Tiket Sudah Digunakan!',
          details: `Pertama scan: ${firstScan}`
        });
      } else {
        setScanResult({
          status: 'invalid',
          message: data.message || 'Tiket Tidak Sah',
        });
      }

      setTicketCode('');
      
      // Auto dismiss
      setTimeout(() => {
        setScanResult({ status: 'idle', message: '' });
      }, 4000);

    } catch (err: any) {
      setScanResult({
        status: 'invalid',
        message: err.message || 'Terjadi kesalahan jaringan'
      });
      setTimeout(() => {
        setScanResult({ status: 'idle', message: '' });
      }, 4000);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-4">
      {/* Header */}
      <div className="w-full max-w-md pt-8 pb-6 flex items-center justify-between">
        <Link 
          href={`/${eventSlug}/checkin/scan`}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="font-semibold text-lg">Input Manual</h1>
        <div className="w-10"></div>
      </div>

      {/* Main Form */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 mb-4">
            <Keyboard className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold">Ketik Kode Tiket</h2>
          <p className="text-slate-400 text-sm mt-1">
            Gunakan mode ini jika kamera bermasalah atau QR tidak terbaca.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              maxLength={8}
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
              className="block w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-2xl text-center text-3xl font-mono tracking-widest text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all uppercase"
              placeholder="XXXXXXXX"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={loading || ticketCode.trim().length < 8}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span className="text-lg">Proses Tiket</span>
                <Send className="w-5 h-5 ml-1" />
              </>
            )}
          </button>
        </form>

        {/* Status Toast */}
        {scanResult.status !== 'idle' && (
          <div className={`absolute top-0 left-0 right-0 p-4 animate-in slide-in-from-top-4 fade-in duration-200 z-10 
            ${scanResult.status === 'success' ? 'bg-emerald-600/90' : 
              scanResult.status === 'duplicate' ? 'bg-amber-600/90' : 
              'bg-red-600/90'} backdrop-blur-md`}
          >
            <div className="flex items-start gap-3">
              {scanResult.status === 'success' && <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5 text-white" />}
              {scanResult.status === 'duplicate' && <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-white" />}
              {scanResult.status === 'invalid' && <XCircle className="w-6 h-6 shrink-0 mt-0.5 text-white" />}
              
              <div>
                <h3 className="font-bold text-white text-lg">{scanResult.message}</h3>
                {scanResult.details && (
                  <p className="text-white/90 text-sm mt-0.5 font-medium">{scanResult.details}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
