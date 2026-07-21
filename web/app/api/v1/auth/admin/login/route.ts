import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  console.log('Login route called!');
  try {
    const body = await req.json();
    console.log('Login body:', body);
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { status: 'error', message: 'Email dan password wajib diisi' },
        { status: 400 }
      );
    }
    console.log('Calling Supabase signIn...');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    console.log('Supabase result:', data ? 'Success' : 'Error', error);

    if (error || !data.session) {
      return NextResponse.json(
        { status: 'error', message: 'Kredensial tidak valid' },
        { status: 401 }
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
