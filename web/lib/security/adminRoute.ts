import { isAdminUser, type UserLike } from '@/lib/security/auth';
import { supabase } from '@/lib/supabase';

const ADMIN_AUTH_TIMEOUT_MS = 8_000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('admin_auth_timeout')), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getAuthenticatedAdmin(request: Request): Promise<UserLike | null> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  if (!token) return null;

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(token),
      ADMIN_AUTH_TIMEOUT_MS,
    );
    if (error || !isAdminUser(data.user)) return null;
    return data.user;
  } catch {
    return null;
  }
}
