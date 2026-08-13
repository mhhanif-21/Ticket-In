'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { ArrowLeft, RefreshCcw, CheckCircle, XCircle, AlertCircle, Sun, Moon } from 'lucide-react';
import Link from 'next/link';

export default function WebScannerPage() {
  const params = useParams();
  const router = useRouter();
  const eventSlug = params.slug as string;

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameras, setHasCameras] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'duplicate' | 'invalid';
    title: string;
    subtitle: string;
  } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isComponentMounted = useRef(true);
  const isTransitioningRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
    }

    if (isTransitioningRef.current) return;

    try {
      isTransitioningRef.current = true;
      setCameraError(null);

      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }

      // Check if element is ready
      if (!document.getElementById('qr-reader')) {
        throw new Error('Element qr-reader not found');
      }

      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 0.75, // Matches aspect-[3/4]
      };

      await scannerRef.current.start(
        { facingMode },
        config,
        async (decodedText) => {
          if (isProcessingRef.current) return;
          handleScannedTicket(decodedText);
        },
        () => {}
      );
      setHasCameras(true);
    } catch (err: any) {
      // Hapus console.error agar Next.js dev overlay tidak muncul
      // console.error('Failed to start scanner', err);
      
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
        setCameraError('Akses kamera ditolak. Mohon izinkan kamera pada browser.');
        setHasCameras(false);
      } else if (facingMode === 'environment') {
        setFacingMode('user'); // Attempt fallback
      } else {
        setHasCameras(false);
        setCameraError('Kamera tidak ditemukan atau tidak dapat diakses.');
      }
    } finally {
      isTransitioningRef.current = false;
    }
  }, [facingMode]); // Removed isProcessing from dependencies

  useEffect(() => {
    isComponentMounted.current = true;
    
    const timer = setTimeout(() => {
      if (isComponentMounted.current) {
        startScanner();
      }
    }, 300); // Delay helps avoid React 18 strict mode race conditions

    return () => {
      isComponentMounted.current = false;
      clearTimeout(timer);
      if (scannerRef.current?.isScanning && !isTransitioningRef.current) {
        isTransitioningRef.current = true;
        scannerRef.current.stop().catch(console.error).finally(() => {
          isTransitioningRef.current = false;
        });
      }
    };
  }, [startScanner]);

  const handleScannedTicket = async (ticketCode: string) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);

    if (scannerRef.current?.isScanning && !isTransitioningRef.current) {
      scannerRef.current.pause();
    }

    try {
      const token = localStorage.getItem('volunteer_token');
      if (!token) throw new Error('Sesi Anda telah berakhir, silakan login kembali.');

      const res = await fetch('/api/v1/checkin/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticket_code: ticketCode, scan_method: 'Camera' })
      });

      const data = await res.json();

      if (res.status === 200) {
        setScanResult({
          status: 'success',
          title: `${data.data.participant_name || ticketCode} is Present!`,
          subtitle: 'Check-in Sukses'
        });
      } else if (res.status === 409) {
        setScanResult({
          status: 'duplicate',
          title: 'Gagal: Peserta Sudah Hadir (Duplikat)',
          subtitle: 'Invalid Entry'
        });
      } else {
        setScanResult({
          status: 'invalid',
          title: 'Gagal: Tiket Tidak Ditemukan/Tidak Valid',
          subtitle: 'Invalid Entry'
        });
      }
    } catch (err: any) {
      setScanResult({
        status: 'invalid',
        title: 'Terjadi kesalahan jaringan',
        subtitle: 'Invalid Entry'
      });
    }

    // Auto-dismiss logic matching FR-CHK-11
    setTimeout(() => {
      if (!isComponentMounted.current) return;
      setScanResult(null);
      setIsProcessing(false);
      if (scannerRef.current?.isScanning) {
        scannerRef.current.resume();
      }
    }, 2000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScannedTicket(manualCode.trim());
      setManualCode('');
    }
  };

  // Dark mode theme mapping variables
  const themeBg = isDarkMode ? 'bg-primary text-on-primary' : 'bg-background text-on-background';
  const headerBg = isDarkMode ? 'bg-primary border-on-primary/20' : 'bg-surface-container-lowest border-outline-variant';
  const viewfinderBorder = isDarkMode ? 'border-on-primary/30' : 'border-primary/30';
  const viewfinderBracket = isDarkMode ? 'border-on-primary' : 'border-primary';
  const scanLine = isDarkMode ? 'bg-on-primary/50' : 'bg-primary/50';

  return (
    <div className={`min-h-screen flex flex-col font-body-md antialiased transition-colors ${themeBg}`} style={{ minHeight: 'max(884px, 100dvh)' }}>
      
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(192px); opacity: 0; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
        .flash-success { animation: flash-green 0.3s ease-out; }
        .flash-error { animation: flash-red 0.3s ease-out; }
        @keyframes flash-green { 0% { background-color: rgba(22, 163, 74, 0.4); } 100% { background-color: transparent; } }
        @keyframes flash-red { 0% { background-color: rgba(186, 26, 26, 0.4); } 100% { background-color: transparent; } }
      `}</style>

      {/* TopAppBar */}
      <header className={`border-b shadow-sm w-full sticky top-0 z-50 ${headerBg}`}>
        <div className="flex justify-between items-center h-16 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <Link href={`/${eventSlug}/checkin`} className="hover:opacity-70 transition-opacity duration-150 active:scale-95 flex items-center justify-center w-11 h-11">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight">Global Summit 2025</h1>
          <button onClick={toggleTheme} className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors active:scale-95 ${isDarkMode ? 'text-on-primary hover:bg-on-primary/10' : 'text-primary hover:bg-primary/10'}`}>
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Scanner Area */}
      <main className="flex-grow relative flex flex-col items-center justify-center py-stack-lg px-margin-mobile md:px-margin-desktop">
        
        {/* Viewfinder */}
        <div 
          id="viewfinder" 
          className={`relative w-full max-w-md aspect-[3/4] rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center 
            ${isDarkMode ? 'bg-primary border border-on-primary/20' : 'bg-surface-variant'} 
            ${scanResult?.status === 'success' ? 'flash-success' : scanResult ? 'flash-error' : ''}`}
        >
          {/* Always render qr-reader for Html5Qrcode to bind to, but hide if no camera */}
          <div 
            id="qr-reader" 
            className={`absolute inset-0 w-full h-full [&>video]:object-cover z-0 ${!hasCameras ? 'hidden' : 'block'}`} 
          />

          {!hasCameras ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-black/60 backdrop-blur-sm text-white">
              <AlertCircle className="w-12 h-12 mb-4 text-error" />
              <p className="font-headline-md font-semibold mb-2">{cameraError || 'Kamera tidak tersedia'}</p>
              <button 
                onClick={() => {
                  setHasCameras(true);
                  startScanner();
                }}
                className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg font-label-caps active:scale-95"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <>
              {/* Aiming Bracket */}
              <div className={`relative w-48 h-48 border-2 z-10 ${viewfinderBorder}`}>
                <div className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 ${viewfinderBracket}`}></div>
                <div className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 ${viewfinderBracket}`}></div>
                <div className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 ${viewfinderBracket}`}></div>
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 ${viewfinderBracket}`}></div>
                
                {/* Scanning line animation */}
                {!isProcessing && (
                  <div className={`absolute top-0 left-0 w-full h-[2px] blur-[1px]`} style={{ animation: 'scan 3s linear infinite', backgroundColor: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}></div>
                )}
              </div>
            </>
          )}

          <button 
            onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
            disabled={!hasCameras}
            className={`absolute top-4 right-4 w-11 h-11 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors active:scale-95 z-20 
              ${isDarkMode ? 'bg-on-primary text-primary hover:bg-on-primary/90' : 'bg-primary/10 text-primary hover:bg-primary/20'} 
              disabled:opacity-50`}
          >
            <RefreshCcw className="w-6 h-6" />
          </button>
        </div>

        {/* Manual Input Form */}
        <form onSubmit={handleManualSubmit} className="mt-stack-lg w-full max-w-md flex flex-col gap-2">
          <label className="font-label-caps text-label-caps" htmlFor="manual-code">Input Kode Manual</label>
          <div className="flex gap-2">
            <input 
              id="manual-code" 
              type="text" 
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter code..." 
              disabled={isProcessing}
              className={`flex-grow border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 
                ${isDarkMode ? 'bg-primary border-on-primary/30 text-on-primary placeholder-on-primary/50 focus:ring-on-primary' : 'bg-surface-container-lowest border-outline-variant placeholder-outline focus:ring-primary'}`}
            />
            <button 
              type="submit" 
              disabled={isProcessing || !manualCode.trim()}
              className={`px-6 py-3 rounded-lg font-label-caps text-label-caps active:scale-95 transition-transform duration-150 disabled:opacity-50
                ${isDarkMode ? 'bg-on-primary text-primary' : 'bg-primary text-on-primary'}`}
            >
              Kirim
            </button>
          </div>
        </form>

      </main>

      {/* Bottom Sheet for Result */}
      {scanResult && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" />
          <div className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto rounded-t-3xl p-stack-lg z-50 animate-slide-up shadow-[0_-8px_32px_rgba(0,0,0,0.1)] flex flex-col items-center text-center
            ${isDarkMode ? 'bg-primary border-t border-on-primary/20' : 'bg-surface-container-lowest'}`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-stack-sm 
              ${scanResult.status === 'success' ? 'bg-[#16a34a] text-white' : 'bg-[#ba1a1a] text-white'}`}
            >
              {scanResult.status === 'success' ? <CheckCircle className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
            </div>
            <h2 className="font-headline-md text-headline-md font-bold mb-1">{scanResult.title}</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">{scanResult.subtitle}</p>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className={`w-full border-t py-8 px-margin-mobile md:px-margin-desktop mt-auto 
        ${isDarkMode ? 'bg-primary border-on-primary/20 text-on-primary' : 'bg-surface border-outline-variant text-on-surface'}`}>
        <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-stack-md">
          <div className="text-on-surface-variant font-description text-description">
            © {new Date().getFullYear()} Event Gate. All rights reserved.
          </div>
          <div className="flex gap-stack-md">
            <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Privacy Policy</Link>
            <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Terms of Service</Link>
            <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
