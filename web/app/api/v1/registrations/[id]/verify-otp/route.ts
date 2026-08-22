import { NextRequest, NextResponse } from 'next/server';
import { verifyOtpAction } from '@/lib/actions/processRegistrationAction';
import { getClientIp } from '@/lib/security/ip';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rateLimit';
import {
  OTP_VERIFY_IP_MAX_ATTEMPTS,
  OTP_VERIFY_MAX_ATTEMPTS,
  OTP_VERIFY_WINDOW_SECONDS,
  otpIpRateLimitKey,
  otpRegistrationRateLimitKey,
} from '@/lib/security/otpRateLimit';

export const runtime = 'nodejs';

function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { status: 'error', message: 'Terlalu banyak percobaan OTP, silakan coba lagi nanti.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

function storageUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { status: 'error', message: 'Layanan verifikasi OTP sementara tidak tersedia.' },
    { status: 503 },
  );
}

const genericOtpError = 'Kode OTP tidak valid atau sudah tidak dapat digunakan.';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: registrationId } = await params;
    const ip = getClientIp(req);
    const ipKey = otpIpRateLimitKey(ip);
    const registrationKey = otpRegistrationRateLimitKey(registrationId);

    // Both counters are incremented before DB verification. Redis INCR makes
    // parallel guesses consume one shared budget instead of racing a read.
    const ipLimit = await checkRateLimit(
      ipKey,
      OTP_VERIFY_IP_MAX_ATTEMPTS,
      OTP_VERIFY_WINDOW_SECONDS,
    );
    if (ipLimit.storageUnavailable) return storageUnavailableResponse();
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.resetAt);

    const registrationLimit = await checkRateLimit(
      registrationKey,
      OTP_VERIFY_MAX_ATTEMPTS,
      OTP_VERIFY_WINDOW_SECONDS,
    );
    if (registrationLimit.storageUnavailable) return storageUnavailableResponse();
    if (!registrationLimit.allowed) return rateLimitResponse(registrationLimit.resetAt);

    const body = await req.json();
    const otpCode = body.otp_code;

    if (typeof otpCode !== 'string' || !/^\d{6}$/.test(otpCode)) {
      return NextResponse.json({ status: 'error', message: 'OTP Code required' }, { status: 400 });
    }

    try {
      const result = await verifyOtpAction(registrationId, otpCode);
      await resetRateLimit(registrationKey);

      return NextResponse.json({ status: 'success', message: 'OTP valid. Pendaftaran diproses.', data: result }, { status: 200 });
    } catch (error: any) {
      if (error instanceof Error && error.message.startsWith('InvalidOTP')) {
        return NextResponse.json({ status: 'error', message: genericOtpError }, { status: 400 });
      }

      console.error('OTP Verification Error');
      return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
    }
  } catch {
    console.error('OTP Verification Request Error');
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
