import { createHash } from 'node:crypto';
import { resetRateLimit } from './rateLimit';

export const OTP_VERIFY_MAX_ATTEMPTS = 5;
export const OTP_VERIFY_IP_MAX_ATTEMPTS = 30;
export const OTP_VERIFY_WINDOW_SECONDS = 15 * 60;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function otpRegistrationRateLimitKey(registrationId: string): string {
  return `otp_verify_registration_${digest(registrationId)}`;
}

export function otpIpRateLimitKey(ip: string): string {
  return `otp_verify_ip_${digest(ip)}`;
}

export async function resetOtpRegistrationRateLimit(registrationId: string): Promise<void> {
  await resetRateLimit(otpRegistrationRateLimitKey(registrationId));
}
