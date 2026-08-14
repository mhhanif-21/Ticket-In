'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RegistrationField } from '@/components/registration/RegistrationField';

export default function RegisterPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/v1/events/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setEventData(data.data);
        } else {
          setError('Event tidak ditemukan');
        }
      })
      .catch(() => setError('Gagal memuat event'))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData(e.currentTarget);

      // Client-Side Validation: Check magic bytes for 'image' fields
      for (const [key, value] of formData.entries()) {
        if (value instanceof File && value.size > 0) {
          const fieldId = key.replace('field_', '');
          const fieldDef = eventData.formFields?.find((f: any) => f.id === fieldId);

          if (fieldDef?.fieldType === 'image' || fieldDef?.fieldType === 'file') {
            const buffer = await value.slice(0, 8).arrayBuffer();
            const bytes = new Uint8Array(buffer);

            const isJPEG = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
            const isPNG = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

            if (!isJPEG && !isPNG) {
              throw new Error(`Berkas untuk kolom "${fieldDef.fieldName}" tidak valid. Hanya menerima gambar JPG/PNG asli.`);
            }
          }
        }
      }

      const res = await fetch(`/api/v1/events/${eventData.slug}/register`, {
        method: 'POST',
        body: formData, // fetch will automatically set multipart/form-data with boundary
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || 'Gagal mendaftar');
      }

      // Fix BUG-011: Conditional Routing based on Registration Mode (Manual Review vs Auto-Accept)
      const name = formData.get('name') as string;
      const email = formData.get('email') as string;
      const regStatus = result.data?.status;
      const regId = result.data?.registrationId;

      if (regStatus === 'Draft') {
        // Manual Review needs OTP verification
        const otpParams = new URLSearchParams({ regId, email, name });
        router.push(`/${slug}/verify-otp?${otpParams.toString()}`);
      } else {
        // Auto-Accept goes straight to status
        const searchParams = new URLSearchParams({ name, email, registered: 'true' });
        router.push(`/${slug}/status?${searchParams.toString()}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error || !eventData) {
    return (
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col items-center justify-center">
        <h1 className="font-display-lg-mobile text-display-lg-mobile text-error mb-stack-sm">{error}</h1>
        <Link href={`/${slug}`} className="font-body-md text-body-md text-primary underline hover:text-secondary">Kembali ke Event</Link>
      </main>
    );
  }

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col md:flex-row gap-stack-lg">
      {/* Graphic Element (Left side on desktop) */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden rounded-[16px]">
        <div className="absolute inset-0 bg-surface-variant flex items-center justify-center">
          {eventData.posterUrl ? (
            <img className="object-cover w-full h-full mix-blend-multiply opacity-80" src={eventData.posterUrl} alt={eventData.name} />
          ) : (
            <div className="text-secondary font-display-lg text-center px-4">{eventData.name}</div>
          )}
        </div>
      </div>

      {/* Form Section */}
      <div className="w-full md:w-1/2 flex flex-col justify-center">
        <div className="mb-stack-lg">
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary mb-stack-sm">Isi Data Pendaftaran</h2>
          <p className="font-description text-description text-secondary">Silakan lengkapi formulir di bawah ini untuk mengonfirmasi pendaftaran Anda.</p>
        </div>
        <div className="bg-surface-container-lowest dark:bg-[#1a2e1f] rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-margin-mobile md:p-margin-desktop">
          {error && (
            <div className="p-4 mb-6 bg-error-container text-on-error-container rounded-lg font-medium text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
            {/* Field Statis / Default */}
            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-primary dark:text-white/80 uppercase">Nama Lengkap <span className="text-primary dark:text-white">*</span></label>
              <input
                type="text"
                name="name"
                required
                className="w-full h-[48px] px-4 bg-transparent dark:bg-white/5 border border-outline-variant dark:border-white/20 rounded-DEFAULT font-body-md text-primary dark:text-white placeholder-on-surface-variant dark:placeholder-white/40 focus:outline-none input-border focus:border-primary dark:focus:border-white/60"
                placeholder="Nama lengkap Anda"
              />
            </div>

            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-primary dark:text-white/80 uppercase">Email Aktif <span className="text-primary dark:text-white">*</span></label>
              <input
                type="email"
                name="email"
                required
                className="w-full h-[48px] px-4 bg-transparent dark:bg-white/5 border border-outline-variant dark:border-white/20 rounded-DEFAULT font-body-md text-primary dark:text-white placeholder-on-surface-variant dark:placeholder-white/40 focus:outline-none input-border focus:border-primary dark:focus:border-white/60"
                placeholder="alamat@email.com"
              />
            </div>

            {/* Dynamic Fields */}
            {eventData.formFields?.map((field: any) => {
              // Lewati nama dan email karena sudah ada field statis
              if (field.fieldName.toLowerCase().includes('nama') || field.fieldName.toLowerCase().includes('email')) {
                return null;
              }

              return <RegistrationField key={field.id} field={field} />;
            })}

            <div className="pt-stack-md mt-stack-sm border-t border-outline-variant/30">
              <button
                type="submit"
                disabled={submitting}
                className="btn-interaction w-full bg-primary text-on-primary hover:bg-inverse-surface rounded-[10px] py-4 px-6 font-body-md text-body-md font-semibold flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? 'Memproses...' : 'Submit Pendaftaran'}
                {!submitting && <span className="material-symbols-outlined text-[20px]">arrow_forward</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
