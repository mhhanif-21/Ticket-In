export interface UserLike {
  id?: string;
  email?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

/**
 * Validates if the given Supabase user has explicit admin authorization.
 *
 * Strict security boundary (WEB-BUG-005):
 * 1. Checks ONLY server-managed claims (app_metadata.role === 'admin').
 * 2. NEVER trusts user_metadata.role (which is user-mutable in client/Supabase).
 * 3. In production, requires explicit ADMIN_EMAILS environment variable configuration.
 * 4. In development/test only, falls back to predefined test emails if ADMIN_EMAILS is unset.
 */
export function isAdminUser(user: UserLike | null | undefined): boolean {
  if (!user) return false;

  // 1. Explicit server-managed claim check (app_metadata only)
  if (user.app_metadata?.role === 'admin') {
    return true;
  }

  // 2. Server-side allowlist check via ADMIN_EMAILS environment variable
  const rawAdminEmails = process.env.ADMIN_EMAILS;
  if (rawAdminEmails && user.email) {
    const allowedEmails = rawAdminEmails
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowedEmails.includes(user.email.trim().toLowerCase())) {
      return true;
    }
  }

  // 3. In development / test environment only, fallback to predefined test admin emails
  if (process.env.NODE_ENV !== 'production' && !rawAdminEmails && user.email) {
    const devTestEmails = ['admin@eventgate.com', 'admin@ticketin.com'];
    if (devTestEmails.includes(user.email.trim().toLowerCase())) {
      return true;
    }
  }

  // user_metadata.role is strictly ignored
  return false;
}
