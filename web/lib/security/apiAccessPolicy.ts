export type ApiAccessPolicy = 'public' | 'admin' | 'volunteer' | 'worker' | 'cron';

const UUID_PATH_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPublicEventSlug(segment: string): boolean {
  try {
    return !UUID_PATH_SEGMENT.test(decodeURIComponent(segment));
  } catch {
    return false;
  }
}

/**
 * Defines the only unauthenticated and non-user API routes. All routes not
 * listed here are admin-only by default, which prevents a new route from
 * becoming public because of a broad prefix or substring match.
 */
export function getApiAccessPolicy(pathname: string, method: string): ApiAccessPolicy {
  if (
    pathname === '/api/v1/worker/process-ticket'
    || pathname === '/api/v1/worker/export'
  ) {
    return 'worker';
  }

  if (
    pathname === '/api/v1/worker/reconcile-participant-files'
    || pathname === '/api/v1/worker/reconcile-storage-cleanup'
    || pathname === '/api/v1/worker/expire-registration-drafts'
  ) {
    return 'cron';
  }

  if (pathname.startsWith('/api/v1/auth/')) {
    return 'public';
  }

  if (pathname === '/api/v1/registration/status' && method === 'GET') {
    return 'public';
  }

  if (
    /^\/api\/v1\/registration\/[0-9a-f-]+\/status$/i.test(pathname)
    && method === 'GET'
  ) {
    // The handler still requires a public status capability; this only avoids
    // treating that capability as a user login session at the middleware.
    return 'public';
  }

  if (
    /^\/api\/v1\/registrations\/[^/]+\/verify-otp$/.test(pathname)
    && method === 'POST'
  ) {
    return 'public';
  }

  if (/^\/api\/v1\/events\/[^/]+\/register$/.test(pathname) && method === 'POST') {
    return 'public';
  }

  if (/^\/api\/v1\/events\/[^/]+\/qr$/.test(pathname) && method === 'GET') {
    return 'public';
  }

  const eventDetailMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
  if (eventDetailMatch && method === 'GET' && isPublicEventSlug(eventDetailMatch[1])) {
    return 'public';
  }

  if (pathname.startsWith('/api/v1/checkin/')) {
    return 'volunteer';
  }

  return 'admin';
}
