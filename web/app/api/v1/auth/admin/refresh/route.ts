import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/security/auth';
import { serializeAdminSession } from '@/lib/security/adminSession';

export const runtime = 'nodejs';
const AUTH_REFRESH_TIMEOUT_MS = 8_000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('auth_refresh_timeout')), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isInvalidRefreshError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };
  const status = candidate.status ?? candidate.statusCode;
  return status === 400
    || status === 401
    || status === 403
    || candidate.code === 'invalid_refresh_token'
    || candidate.code === 'refresh_token_not_found';
}

function requestIdFor(request: Request): string {
  return request.headers.get('x-request-id')?.trim()
    || request.headers.get('x-vercel-id')?.trim()
    || 'admin-refresh-request';
}

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
        { status: 'error', message: 'Refresh token is required' },
        { status: 400 },
      );
    }

    let data;
    let error;
    try {
      ({ data, error } = await withTimeout(
        createRefreshClient().auth.refreshSession({
          refresh_token: refreshToken,
        }),
        AUTH_REFRESH_TIMEOUT_MS,
      ));
    } catch (refreshError) {
      console.error('admin_session_refresh_unavailable', {
        requestId: requestIdFor(request),
        errorName: refreshError instanceof Error ? refreshError.name : 'UnknownError',
      });
      return NextResponse.json(
        {
          status: 'error',
          code: 'AUTH_REFRESH_UNAVAILABLE',
          message: 'Session service temporarily unavailable. Please try again.',
        },
        { status: 503 },
      );
    }

    if (error) {
      if (!isInvalidRefreshError(error)) {
        console.error('admin_session_refresh_unavailable', {
          requestId: requestIdFor(request),
          errorName: error instanceof Error ? error.name : 'AuthProviderError',
        });
        return NextResponse.json(
          {
            status: 'error',
            code: 'AUTH_REFRESH_UNAVAILABLE',
            message: 'Session service temporarily unavailable. Please try again.',
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { status: 'error', message: 'Session expired or invalid' },
        { status: 401 },
      );
    }

    if (!data.session || !data.user) {
      return NextResponse.json(
        { status: 'error', message: 'Session expired or invalid' },
        { status: 401 },
      );
    }

    if (!isAdminUser(data.user)) {
      return NextResponse.json(
        { status: 'error', message: 'Account does not have admin access' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      status: 'success',
      data: serializeAdminSession(data.session, data.user),
    });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Session cannot be refreshed' },
      { status: 401 },
    );
  }
}
