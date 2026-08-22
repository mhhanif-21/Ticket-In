const LOCAL_ALLOWED_HOSTS = [
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/i,
];

const DEFAULT_ALLOWED_HOSTS = [
  ...LOCAL_ALLOWED_HOSTS,
  /^ticketin\.id$/i,
  /^eventgate\.com$/i,
];

function getAllowedHostPatterns(): RegExp[] {
  const custom = process.env.ALLOWED_HOSTS?.trim();
  if (!custom) return DEFAULT_ALLOWED_HOSTS;

  const patterns = custom
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => {
      // Escape regex special chars
      const escaped = h.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped}$`, 'i');
    });

  // A configured allowlist is authoritative for public hosts. Localhost stays
  // available for development, but deployment defaults must not be silently
  // re-enabled when an operator intentionally narrows the list.
  return [...LOCAL_ALLOWED_HOSTS, ...patterns];
}

function sanitizeProtocol(proto: string | null | undefined): 'http' | 'https' {
  if (!proto) return 'https';
  const clean = proto.trim().toLowerCase();
  if (clean === 'http' || clean === 'https') {
    return clean;
  }
  // Any untrusted or malformed protocol (javascript:, ftp:, data:) is neutralized to https
  return 'https';
}

function parseConfiguredCanonicalUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Resolves the canonical base URL for public links and QR code generation.
 *
 * Rules (WEB-BUG-016):
 * 1. The first valid environment variable in the order
 *    NEXT_PUBLIC_APP_URL / APP_URL / CANONICAL_APP_URL takes precedence.
 * 2. In production, a canonical URL environment variable is MANDATORY.
 * 3. In dev/preview fallback:
 *    - Host header is strictly validated against an explicit allowlist.
 *    - Protocol is strictly validated and sanitized (only http / https).
 * 4. Untrusted or malicious Host/Proto headers fall back to the safe default canonical URL.
 */
export function getCanonicalBaseUrl(
  req?: Request | { headers: Headers | { get(name: string): string | null } }
): string {
  for (const envName of ['NEXT_PUBLIC_APP_URL', 'APP_URL', 'CANONICAL_APP_URL']) {
    const envUrl = process.env[envName];
    if (!envUrl) continue;

    const canonicalUrl = parseConfiguredCanonicalUrl(envUrl);
    if (canonicalUrl) {
      return canonicalUrl;
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    throw new Error(
      'A valid canonical public URL is required in production; configure NEXT_PUBLIC_APP_URL, APP_URL, or CANONICAL_APP_URL'
    );
  }

  // Preview / Development fallback with strict validation
  if (req) {
    const rawHost = req.headers.get('host') || '';
    const host = rawHost.trim().toLowerCase();
    const rawProto = req.headers.get('x-forwarded-proto');
    const proto = sanitizeProtocol(rawProto);

    const patterns = getAllowedHostPatterns();
    const isAllowed = patterns.some((p) => p.test(host));

    if (isAllowed && host.length > 0) {
      return `${proto}://${host}`;
    }
  }

  return 'http://localhost:3000';
}
