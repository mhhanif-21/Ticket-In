import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAdminUser } from '@/lib/security/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { status: 'error', message: 'Email dan password wajib diisi' },
        { status: 400 }
      );
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { status: 'error', message: 'Kredensial tidak valid' },
        { status: 401 }
      );
    }

    // WEB-BUG-005: Enforce explicit admin role / allowlist validation
    if (!isAdminUser(data.user)) {
      return NextResponse.json(
        { status: 'error', message: 'Akun tidak memiliki hak akses admin' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: {
          access_token: data.session.access_token,
          role: 'admin',
          user: {
            id: data.user.id,
            name: data.user.user_metadata?.name || 'Admin Event Gate',
            email: data.user.email,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan internal server' },
      { status: 500 }
    );
  }
}
