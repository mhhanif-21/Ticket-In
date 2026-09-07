import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAdminUser } from '@/lib/security/auth';
import { serializeAdminSession } from '@/lib/security/adminSession';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { status: 'error', message: 'Email and password are required' },
        { status: 400 }
      );
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // WEB-BUG-005: Enforce explicit admin role / allowlist validation
    if (!isAdminUser(data.user)) {
      return NextResponse.json(
        { status: 'error', message: 'Account does not have admin access' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: serializeAdminSession(data.session, data.user),
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
