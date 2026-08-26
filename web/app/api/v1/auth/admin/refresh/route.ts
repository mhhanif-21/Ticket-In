import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/security/auth';
import { serializeAdminSession } from '@/lib/security/adminSession';

export const runtime = 'nodejs';

function createRefreshClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const refreshToken = typeof body?.refresh_token === 'string'
      ? body.refresh_token.trim()
      : '';

    if (!refreshToken) {
      return NextResponse.json(
        { status: 'error', message: 'Refresh token wajib diisi' },
        { status: 400 },
      );
    }

    const { data, error } = await createRefreshClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { status: 'error', message: 'Sesi kedaluwarsa atau tidak valid' },
        { status: 401 },
      );
    }

    if (!isAdminUser(data.user)) {
      return NextResponse.json(
        { status: 'error', message: 'Akun tidak memiliki hak akses admin' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      status: 'success',
      data: serializeAdminSession(data.session, data.user),
    });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Sesi tidak dapat diperbarui' },
      { status: 401 },
    );
  }
}
