import { isAdminUser, type UserLike } from '@/lib/security/auth';
import { supabase } from '@/lib/supabase';

export async function getAuthenticatedAdmin(request: Request): Promise<UserLike | null> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !isAdminUser(data.user)) return null;
  return data.user;
}
