import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client khusus untuk edge runtime middleware
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  
  if (url.pathname.startsWith('/api/v1/')) {
    // Lewati endpoint autentikasi, status pengecekan (public), dan form registrasi (public)
    if (
      url.pathname.startsWith('/api/v1/auth/') ||
      url.pathname.includes('/status') ||
      url.pathname.match(/^\/api\/v1\/events\/[^\/]+\/register$/) ||
      url.pathname.match(/^\/api\/v1\/registrations\/[^\/]+\/verify-otp$/)
    ) {
      return NextResponse.next();
    }
    
    // Verifikasi Token untuk Endpoint Terproteksi
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized: Missing Token' }, { status: 401 });
    }
    
    const token = authHeader.split(' ')[1];
    let userId = '';
    let role = '';
    let eventId = '';

    try {
      // Decode tanpa verifikasi dulu untuk cek tipe token
      const { decodeJwt } = await import('jose');
      const decoded = decodeJwt(token);
      
      if (decoded && decoded.role === 'volunteer') {
        // Ini adalah token Volunteer buatan kita
        const { jwtVerify } = await import('jose');
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
        const { payload } = await jwtVerify(token, secret);
        
        userId = payload.volunteer_name as string;
        role = 'volunteer';
        eventId = payload.event_id as string;
      } else {
        // Asumsikan token Supabase (Admin)
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) throw new Error('Supabase token invalid');
        
        userId = data.user.id;
        role = 'admin';
      }
    } catch (err) {
      return NextResponse.json({ status: 'error', message: 'Token tidak valid atau kedaluwarsa' }, { status: 401 });
    }

    // Role-based Access Control (RBAC) Sederhana
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
    requestHeaders.set('x-user-role', role);
    if (eventId) requestHeaders.set('x-event-id', eventId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/v1/:path*',
};
