'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AdaptiveImage } from '@/components/media/AdaptiveImage';
import { RegistrationField } from '@/components/registration/RegistrationField';
import { getRegistrationFieldKey, isStaticRegistrationField, validateRegistrationAnswers } from '@/lib/validation/registrationForm';
import { validateParticipantFile } from '@/lib/validation/participantFile';
import {
  loadRegistrationResubmitState,
  saveRegistrationResubmitState,
  type RegistrationResubmitState,
} from '@/lib/client/registrationResubmit';

function collectAnswerValues(formData: FormData): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === 'name' || key === 'email' || key === 'registration_id' || key === 'resubmit_token' || key === 'retry_only') continue;
    const current = answers[key];
    answers[key] = current === undefined
      ? value
      : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return answers;
}

function collectSerializableAnswers(formData: FormData): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(collectAnswerValues(formData))) {
    if (value instanceof Blob) continue;
    answers[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : String(value);
  }
  return answers;
}

export default function RegisterPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const correctionRegistrationId = searchParams.get('registration_id');
  const correctionMode = Boolean(correctionRegistrationId);

  const [eventData, setEventData] = useState<any>(null);
  const [resubmitState, setResubmitState] = useState<RegistrationResubmitState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (correctionRegistrationId) {
      const stored = loadRegistrationResubmitState(slug);
      if (!stored || stored.registrationId !== correctionRegistrationId) {
        setError('Sesi perubahan email tidak tersedia. Silakan mulai pendaftaran kembali.');
      } else {
        setResubmitState(stored);
      }
    }

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
  }, [correctionRegistrationId, slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (Object.keys(fileErrors).length > 0) {
      setSubmitting(false);
      setError('Perbaiki berkas yang ditandai sebelum mengirim formulir.');
      return;
    }

    try {
      const formData = new FormData(e.currentTarget);
      const dynamicFields = (eventData.formFields || []).filter((field: any) => !isStaticRegistrationField(field.fieldName));
      validateRegistrationAnswers(dynamicFields, collectAnswerValues(formData));

      if (correctionMode) {
        if (!resubmitState || resubmitState.registrationId !== correctionRegistrationId) {
          throw new Error('Sesi perubahan email tidak tersedia. Silakan mulai pendaftaran kembali.');
        }
        formData.set('registration_id', resubmitState.registrationId);
        formData.set('resubmit_token', resubmitState.resubmitToken);
      }

      // Repeat the immediate picker validation so programmatic form changes
      // cannot bypass the browser-side guard.
      for (const [key, value] of formData.entries()) {
        if (value instanceof File && value.size > 0) {
          const fieldDef = eventData.formFields?.find((field: any) => getRegistrationFieldKey(field) === key);

          if (fieldDef?.fieldType === 'image' || fieldDef?.fieldType === 'file') {
            await validateParticipantFile({ file: value, fieldType: fieldDef.fieldType });
          }
        }
      }

      const res = await fetch(`/api/v1/events/${eventData.slug}/register`, {
        method: 'POST',
        body: formData, // fetch will automatically set multipart/form-data with boundary
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.data?.status === 'Draft' && result.data?.retryable && result.data.registrationId && result.data.resubmitToken) {
          const retryState: RegistrationResubmitState = {
            registrationId: result.data.registrationId,
            resubmitToken: result.data.resubmitToken,
            name: formData.get('name') as string,
            email: formData.get('email') as string,
            answers: collectSerializableAnswers(formData),
          };
          saveRegistrationResubmitState(slug, retryState);
          setResubmitState(retryState);
          router.push(`/${slug}/verify-otp?regId=${encodeURIComponent(retryState.registrationId)}&deliveryRetry=1`);
          return;
        }
        throw new Error(result.message || 'Gagal mendaftar');
      }

      // Fix BUG-011: Conditional Routing based on Registration Mode (Manual Review vs Auto-Accept)
      const name = formData.get('name') as string;
      const email = formData.get('email') as string;
      const regStatus = result.data?.status;
      const regId = result.data?.registrationId;

      if (regStatus === 'Draft') {
        if (!regId || !result.data?.resubmitToken) {
          throw new Error('Bukti pengiriman OTP tidak tersedia. Silakan coba lagi.');
        }
        const nextState: RegistrationResubmitState = {
          registrationId: regId,
          resubmitToken: result.data.resubmitToken,
          name,
          email,
          answers: collectSerializableAnswers(formData),
        };
        saveRegistrationResubmitState(slug, nextState);
        setResubmitState(nextState);
        // Manual Review needs OTP verification
        const otpParams = new URLSearchParams({ regId });
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

  const handleFileChange = async (field: any, file: File | null) => {
    const fieldKey = getRegistrationFieldKey(field);
    if (!file || file.size === 0) {
      setFileErrors((current) => {
        const { [fieldKey]: _removed, ...rest } = current;
        return rest;
      });
      return;
    }
    try {
      await validateParticipantFile({ file, fieldType: field.fieldType });
      setFileErrors((current) => {
        const { [fieldKey]: _removed, ...rest } = current;
        return rest;
      });
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : 'Berkas tidak valid.';
      setFileErrors((current) => ({ ...current, [fieldKey]: message }));
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
        <div className="bg-surface-variant flex items-center justify-center">
          {eventData.posterUrl ? (
            <AdaptiveImage
              src={eventData.posterUrl}
              alt={eventData.name}
              sizes="(max-width: 768px) 100vw, 50vw"
              containerClassName="w-full"
              imageClassName="mix-blend-multiply opacity-80"
            />
          ) : (
            <div className="px-4 py-24 text-center font-display-lg text-secondary">{eventData.name}</div>
          )}
        </div>
      </div>

      {/* Form Section */}
      <div className="w-full md:w-1/2 flex flex-col justify-center">
        <div className="mb-stack-lg">
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary mb-stack-sm">{correctionMode ? 'Ubah Email Pendaftaran' : 'Isi Data Pendaftaran'}</h2>
          <p className="font-description text-description text-secondary">{correctionMode ? 'Perbarui email Anda. Bukti perubahan hanya berlaku sekali.' : 'Silakan lengkapi formulir di bawah ini untuk mengonfirmasi pendaftaran Anda.'}</p>
        </div>
        <div className="bg-surface-container-lowest dark:bg-[#1e1e1e] rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-margin-mobile md:p-margin-desktop">
          {correctionMode && (
            <div className="p-4 mb-6 bg-primary-container/20 text-primary rounded-lg font-medium text-sm">
              Perubahan email akan mengirim OTP baru ke alamat yang Anda masukkan.
            </div>
          )}
          {error && (
            <div className="p-4 mb-6 bg-error-container text-on-error-container rounded-lg font-medium text-sm">
              {error}
            </div>
          )}
          <form key={correctionMode ? resubmitState?.registrationId || 'correction-pending' : 'new-registration'} onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
            {/* Field Statis / Default */}
            <div className="flex flex-col gap-stack-sm">
              <label className="font-label-caps text-label-caps text-primary dark:text-white/80 uppercase">Nama Lengkap <span className="text-primary dark:text-white">*</span></label>
              <input
                type="text"
                name="name"
                defaultValue={resubmitState?.name || ''}
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
                defaultValue={resubmitState?.email || ''}
                required
                className="w-full h-[48px] px-4 bg-transparent dark:bg-white/5 border border-outline-variant dark:border-white/20 rounded-DEFAULT font-body-md text-primary dark:text-white placeholder-on-surface-variant dark:placeholder-white/40 focus:outline-none input-border focus:border-primary dark:focus:border-white/60"
                placeholder="alamat@email.com"
              />
            </div>

            {/* Dynamic Fields */}
            {eventData.formFields?.map((field: any) => {
              // Lewati nama dan email karena sudah ada field statis
              if (isStaticRegistrationField(field.fieldName)) {
                return null;
              }

              const fieldKey = getRegistrationFieldKey(field);
              return (
                <RegistrationField
                  key={fieldKey}
                  field={field}
                  defaultValue={resubmitState?.answers?.[fieldKey]}
                  fileError={fileErrors[fieldKey]}
                  onFileChange={handleFileChange}
                />
              );
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
