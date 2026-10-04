import { getCanonicalBaseUrl } from '@/lib/security/url';

export const DEFAULT_EMAIL_LOGO_PATH = '/logo-ecx.jpeg';

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

/**
 * Email clients require an absolute, publicly reachable logo URL. The asset is
 * served from the Next.js public folder using the configured canonical origin.
 */
export function resolveEmailLogoUrl(): string {
  return `${getCanonicalBaseUrl()}${DEFAULT_EMAIL_LOGO_PATH}`;
}

export function formatEventDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatEventTime(date: Date): string {
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${time} WIB`;
}
