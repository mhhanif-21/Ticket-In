import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/security/auth';
import { verifyVolunteerToken } from '@/lib/security/jwt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const uuidPathSegment = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPublicEventSlug(segment: string) {
  try {
    return !uuidPathSegment.test(decodeURIComponent(segment));
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

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
        const { data, error } = await supabase.auth.getUser(token);
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
      return NextResponse.redirect(new URL(`/${slug}/checkin`, req.url));
    }

    const verification = await verifyToken(token);
    if (
      !verification.valid ||
      verification.role !== 'volunteer' ||
      verification.payload?.event_slug !== slug
    ) {
      return NextResponse.redirect(new URL(`/${slug}/checkin`, req.url));
    }

    return NextResponse.next();
  }

  if (url.pathname.startsWith('/api/v1/')) {
    if (url.pathname === '/api/v1/worker/process-ticket' || url.pathname === '/api/v1/worker/export') {
      return NextResponse.next();
    }

    const eventDetailMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
    const isPublicEventSlugDetail = Boolean(eventDetailMatch && isPublicEventSlug(eventDetailMatch[1]));

    // Lewati endpoint autentikasi, status pengecekan (public), dan form registrasi (public).
    // Detail event berbasis UUID adalah kontrak Admin; detail berbasis slug adalah DTO publik.
    if (
      url.pathname.startsWith('/api/v1/auth/') ||
      url.pathname.includes('/status') ||
      url.pathname.match(/^\/api\/v1\/events\/[^\/]+\/register$/) ||
      url.pathname.match(/^\/api\/v1\/events\/[^\/]+\/qr$/) ||
      url.pathname.match(/^\/api\/v1\/registrations\/[^\/]+\/verify-otp$/) ||
      (isPublicEventSlugDetail && req.method === 'GET')
    ) {
      return NextResponse.next();
    }

    // Verifikasi Token untuk Endpoint Terproteksi
    const authHeader = req.headers.get('authorization');
    const authorizationToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = authorizationToken || req.cookies.get('volunteer_token')?.value;
    if (!token) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized: Missing Token' }, { status: 401 });
    }

    const verification = await verifyToken(token);

    if (!verification.valid) {
      return NextResponse.json({ status: 'error', message: 'Token tidak valid atau kedaluwarsa' }, { status: 401 });
    }

    const { payload, role } = verification;
    const userId = role === 'volunteer' ? (payload?.volunteer_name as string) : (payload?.id as string);
    const eventId = role === 'volunteer' ? (payload?.event_id as string) : '';
    const sessionId = role === 'volunteer' ? (payload?.session_id as string) : '';

    // Role-based Access Control (RBAC)
    const pathname = url.pathname;
    if ((pathname.startsWith('/api/v1/events') || pathname.startsWith('/api/v1/registrations')) && role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Hanya Admin yang dapat mengakses rute ini' }, { status: 403 });
    }
    if (pathname.startsWith('/api/v1/checkin') && role !== 'volunteer') {
      return NextResponse.json({ status: 'error', message: 'Hanya Volunteer yang dapat mengakses rute ini' }, { status: 403 });
    }

    // Tambahkan info ke header internal
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', userId);
    if (role) requestHeaders.set('x-user-role', role);
    if (eventId) requestHeaders.set('x-event-id', eventId);
    if (sessionId) requestHeaders.set('x-session-id', sessionId);

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
