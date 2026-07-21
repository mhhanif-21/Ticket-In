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
    
    // Menggunakan getUser karena lebih aman (berbicara langsung ke server Supabase)
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return NextResponse.json({ status: 'error', message: 'Token tidak valid atau kedaluwarsa' }, { status: 401 });
    }
    
    // Tambahkan UID ke header internal
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', data.user.id);

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
