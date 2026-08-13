'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function StatusCheckPage({ params }: { params: { slug: string } }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [ticketData, setTicketData] = useState<any>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'processing' | 'completed'>('idle');

  // Submit form
  const checkStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTicketData(null);
    setPollingStatus('idle');

    try {
      const res = await fetch(`/api/v1/registration/status?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
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
    }
  };

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <Link href={`/${params.slug}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6 inline-block">
            &larr; Kembali ke Event
          </Link>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Cek Status Tiket</h1>
          <p className="text-gray-500 mb-8">Masukkan nama dan email yang Anda gunakan saat mendaftar.</p>

          {!ticketData ? (
            <form onSubmit={checkStatus} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="john@example.com"
                />
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg shadow-sm transition-colors disabled:opacity-70"
              >
                {loading ? 'Memeriksa...' : 'Cari Tiket Saya'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="text-center p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Nama Peserta</p>
                <p className="font-semibold text-gray-900 text-lg">{ticketData.name}</p>
              </div>

              {ticketData.status === 'Draft' || ticketData.status === 'Pending' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <h3 className="font-bold text-amber-800 mb-1">Menunggu Persetujuan</h3>
                  <p className="text-amber-700 text-sm">Pendaftaran Anda sedang ditinjau atau menunggu verifikasi OTP. Silakan cek email secara berkala.</p>
                </div>
              ) : ticketData.status === 'Rejected' ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                  <h3 className="font-bold text-red-800 mb-1">Pendaftaran Ditolak</h3>
                  <p className="text-red-700 text-sm">Mohon maaf, pendaftaran Anda tidak dapat diproses saat ini.</p>
                </div>
              ) : ticketData.status === 'Accepted' && pollingStatus === 'processing' ? (
                <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl text-center flex flex-col items-center">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <h3 className="font-bold text-blue-800 mb-1">Sedang Menerbitkan Tiket</h3>
                  <p className="text-blue-700 text-sm">Sistem sedang men-generate QR Code unik Anda. Mohon tunggu...</p>
                </div>
              ) : ticketData.status === 'Accepted' && pollingStatus === 'completed' ? (
                <div className="p-6 bg-green-50 border border-green-200 rounded-xl flex flex-col items-center">
                  <h3 className="font-bold text-green-800 mb-4">Pendaftaran Berhasil!</h3>
                  <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                    <img src={ticketData.qr_code_url} alt="QR Code" className="w-48 h-48 object-contain" />
                  </div>
                  <p className="text-gray-900 font-mono font-bold tracking-widest text-lg">{ticketData.ticket_code}</p>
                  <p className="text-green-700 text-xs mt-4 text-center">Tunjukkan QR Code ini kepada panitia saat Check-In.</p>
                </div>
              ) : null}

              <button
                onClick={() => setTicketData(null)}
                className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg shadow-sm transition-colors"
              >
                Cek Tiket Lain
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
