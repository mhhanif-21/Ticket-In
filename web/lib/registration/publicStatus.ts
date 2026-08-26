import { NextResponse } from 'next/server';

import { getClientIp } from '@/lib/security/ip';
import {
  getPublicRegistrationStatus,
  getRegistrationStatusCapabilityFromRequest,
} from '@/lib/security/publicStatusCapability';
import { checkRateLimit } from '@/lib/security/rateLimit';

const MAX_LOOKUP_REQUESTS_PER_MINUTE = 15;
const LOOKUP_WINDOW_SECONDS = 60;

function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      status: 'error',
      message: 'Terlalu banyak permintaan pengecekan status tiket, silakan coba lagi beberapa saat lagi.',
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

/**
 * Returns a minimal public DTO only after verifying the opaque, scoped, and
 * unexpired holder capability in the Authorization header. The capability is
 * deliberately never read from a URL query parameter.
 */
export async function getPublicRegistrationStatusResponse(
  request: Request,
  expectedRegistrationId?: string,
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(
    `status_lookup_ip_${ip}`,
    MAX_LOOKUP_REQUESTS_PER_MINUTE,
    LOOKUP_WINDOW_SECONDS,
  );

  if (rateLimit.storageUnavailable) {
    return NextResponse.json(
      { status: 'error', message: 'Layanan pengecekan tiket sementara tidak tersedia.' },
      { status: 503 },
    );
  }

  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  const capability = getRegistrationStatusCapabilityFromRequest(request);
  if (!capability) {
    return NextResponse.json(
      { status: 'error', message: 'Bukti akses status diperlukan.' },
      { status: 401 },
    );
  }

  const registration = await getPublicRegistrationStatus(capability, expectedRegistrationId);
  if (!registration) {
    return NextResponse.json(
      { status: 'error', message: 'Bukti akses status tidak valid atau sudah kedaluwarsa.' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    status: 'success',
    data: {
      status: registration.status,
      ticket_job_status: registration.ticketJobStatus,
      // These values are intentionally present only after capability proof.
      ticket_code: registration.ticketCode,
      qr_code_url: registration.qrCodeUrl,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
