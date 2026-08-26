import type { UserLike } from '@/lib/security/auth';

export interface AdminSessionLike {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}

export function serializeAdminSession(session: AdminSessionLike, user: UserLike) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    role: 'admin',
    user: {
      id: user.id,
      name: user.user_metadata?.name || 'Admin Event Gate',
      email: user.email,
    },
  };
}
