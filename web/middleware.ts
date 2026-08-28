import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/security/auth';
import { getApiAccessPolicy } from '@/lib/security/apiAccessPolicy';
import { verifyVolunteerToken } from '@/lib/security/jwt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_AUTH_TIMEOUT_MS = 4_000;
const EVENT_UUID_PATH = /^\/api\/v1\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestIdFor(req: NextRequest): string {
  return req.headers.get('x-request-id')?.trim()
    || req.headers.get('x-vercel-id')?.trim()
    || 'middleware-request';
}

function logMiddlewareTiming(req: NextRequest, stage: string, startedAt: number): void {
  console.info('middleware_timing', {
    requestId: requestIdFor(req),
    stage,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
}

function handlerOwnsAdminAuth(pathname: string, method: string): boolean {
  if (method === 'GET' && EVENT_UUID_PATH.test(pathname)) return true;
  if (method === 'GET' && /^\/api\/v1\/registrations\/[^/]+\/files\/[^/]+$/.test(pathname)) return true;
  return false;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('auth_lookup_timeout')), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const startedAt = Date.now();

  // Extract token verification logic
  async function verifyToken(token: string) {
    try {
      const { decodeJwt } = await import('jose');
      const decoded = decodeJwt(token);

      if (decoded && decoded.role === 'volunteer') {
        const payload = await verifyVolunteerToken(token);
        return { valid: true, payload, role: 'volunteer' as const };
      } else {
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase credentials missing');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
        const { data, error } = await withTimeout(
          supabase.auth.getUser(token),
          SUPABASE_AUTH_TIMEOUT_MS,
        );
        if (error || !data.user) throw new Error('Supabase token invalid');

        const isAdmin = isAdminUser(data.user);
        return {
          valid: true,
          payload: { id: data.user.id, email: data.user.email },
          role: isAdmin ? ('admin' as const) : ('user' as const),
        };
      }
    } catch {
      return { valid: false, payload: null, role: null };
    }
  }

  // Protect scanner page at the middleware level (Verify Token deeply)
  const scannerPath = url.pathname.match(/^\/([^/]+)\/checkin\/(scan|manual)\/?$/);
  if (scannerPath) {
    const token = req.cookies.get('volunteer_token')?.value;
    const slug = scannerPath[1];

    if (!token) {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.redirect(new URL(`/${slug}/checkin`, req.url));
    }

    logMiddlewareTiming(req, 'parseToken', startedAt);
    const verification = await verifyToken(token);
    logMiddlewareTiming(req, 'verifySession', startedAt);
    if (
      !verification.valid ||
      verification.role !== 'volunteer' ||
      verification.payload?.event_slug !== slug
    ) {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.redirect(new URL(`/${slug}/checkin`, req.url));
    }

    logMiddlewareTiming(req, 'redirectDecision', startedAt);
    return NextResponse.next();
  }

  if (url.pathname.startsWith('/api/v1/')) {
    const accessPolicy = getApiAccessPolicy(url.pathname, req.method);
    if (accessPolicy === 'worker' || accessPolicy === 'cron' || accessPolicy === 'public') {
      return NextResponse.next();
    }

    // These handlers already perform independent admin authentication. Keep
    // the middleware on a cheap routing path so a slow Supabase auth request
    // cannot consume the platform's middleware invocation budget.
    if (accessPolicy === 'admin' && handlerOwnsAdminAuth(url.pathname, req.method)) {
      logMiddlewareTiming(req, 'authDeferredToHandler', startedAt);
      return NextResponse.next();
    }

    // Verifikasi Token untuk Endpoint Terproteksi
    const authHeader = req.headers.get('authorization');
    const authorizationToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = authorizationToken || req.cookies.get('volunteer_token')?.value;
    if (!token) {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.json({ status: 'error', message: 'Unauthorized: Missing Token' }, { status: 401 });
    }

    logMiddlewareTiming(req, 'parseToken', startedAt);
    const verification = await verifyToken(token);
    logMiddlewareTiming(req, 'verifySession', startedAt);

    if (!verification.valid) {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.json({ status: 'error', message: 'Token tidak valid atau kedaluwarsa' }, { status: 401 });
    }

    const { payload, role } = verification;
    const userId = role === 'volunteer' ? (payload?.volunteer_name as string) : (payload?.id as string);
    const eventId = role === 'volunteer' ? (payload?.event_id as string) : '';
    const sessionId = role === 'volunteer' ? (payload?.session_id as string) : '';
    const sessionVersion = role === 'volunteer' ? String(payload?.session_version ?? '') : '';

    // Role-based Access Control (RBAC)
    if (accessPolicy === 'admin' && role !== 'admin') {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.json({ status: 'error', message: 'Hanya Admin yang dapat mengakses rute ini' }, { status: 403 });
    }
    if (accessPolicy === 'volunteer' && role !== 'volunteer') {
      logMiddlewareTiming(req, 'redirectDecision', startedAt);
      return NextResponse.json({ status: 'error', message: 'Hanya Volunteer yang dapat mengakses rute ini' }, { status: 403 });
    }

    // Tambahkan info ke header internal
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', userId);
    if (role) requestHeaders.set('x-user-role', role);
    if (eventId) requestHeaders.set('x-event-id', eventId);
    if (sessionId) requestHeaders.set('x-session-id', sessionId);
    if (sessionVersion) requestHeaders.set('x-session-version', sessionVersion);

    logMiddlewareTiming(req, 'redirectDecision', startedAt);
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all API paths and all page paths,
     * except for static assets and Next.js internal routes.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
