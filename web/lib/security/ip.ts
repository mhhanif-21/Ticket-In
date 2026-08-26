import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export interface RequestWithHeaders {
  headers: Headers | { get(name: string): string | null };
}

export const TRUSTED_PROXY_ASSERTION_HEADER = 'x-ticketin-proxy-assertion';
export const TRUSTED_CLIENT_IP_HEADER = 'x-ticketin-client-ip';
export const VERCEL_CLIENT_IP_HEADER = 'x-vercel-forwarded-for';
export const UNTRUSTED_CLIENT_KEY = 'untrusted-client';
export const TRUSTED_PROXY_UNKNOWN_KEY = 'trusted-proxy-unknown';

function getConfiguredClientIpHeader(): string {
  const configured = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configured && /^[a-z0-9-]+$/.test(configured)) {
    return configured;
  }
  return TRUSTED_CLIENT_IP_HEADER;
}

function secretsMatch(expected: string, presented: string | null): boolean {
  if (!presented) return false;

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const presentedBuffer = Buffer.from(presented.trim(), 'utf8');
  if (expectedBuffer.length !== presentedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, presentedBuffer);
}

function parseSingleIp(value: string | null): string | null {
  if (!value) return null;

  const candidate = value.trim();
  if (!candidate || candidate.includes(',') || isIP(candidate) === 0) {
    return null;
  }

  return candidate;
}

/**
 * Returns true only when the request carries an assertion issued by the
 * configured ingress proxy. Header names alone never establish trust.
 */
export function isTrustedProxy(req: RequestWithHeaders): boolean {
  const configuredSecret = process.env.TRUSTED_PROXY_SHARED_SECRET?.trim();
  if (!configuredSecret) return false;

  return secretsMatch(
    configuredSecret,
    req.headers.get(TRUSTED_PROXY_ASSERTION_HEADER)
  );
}

/**
 * Vercel overwrites X-Forwarded-For and publishes the platform-controlled
 * value as X-Vercel-Forwarded-For. Do not enable this path outside Vercel;
 * local or self-hosted deployments must use the asserted proxy contract.
 */
function isNativeVercelRequest(req: RequestWithHeaders): boolean {
  return process.env.VERCEL === '1' && Boolean(req.headers.get('x-vercel-id'));
}

/**
 * Resolves the rate-limit identity using an authenticated ingress contract.
 * Direct clients cannot select a bucket by sending forwarded-IP headers.
 */
export function getClientIp(req: RequestWithHeaders): string {
  if (isNativeVercelRequest(req)) {
    return parseSingleIp(req.headers.get(VERCEL_CLIENT_IP_HEADER)) || TRUSTED_PROXY_UNKNOWN_KEY;
  }

  if (!isTrustedProxy(req)) {
    return UNTRUSTED_CLIENT_KEY;
  }

  const clientIp = parseSingleIp(
    req.headers.get(getConfiguredClientIpHeader())
  );
  return clientIp || TRUSTED_PROXY_UNKNOWN_KEY;
}
