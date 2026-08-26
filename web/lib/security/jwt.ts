import * as jose from 'jose';

export interface VolunteerJwtPayload extends jose.JWTPayload {
  role: 'volunteer';
  event_id: string;
  event_slug: string;
  session_id: string;
  session_version: number;
  volunteer_name: string;
}

const WEAK_DEFAULT_SECRET = 'super-secret-key';

/**
 * Retrieves and validates the secret key used for signing and verifying volunteer JWTs.
 * Rejects missing or weak hardcoded defaults.
 */
export function getVolunteerJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required and must be configured');
  }

  if (secret === WEAK_DEFAULT_SECRET) {
    throw new Error('Default weak JWT_SECRET is prohibited. Please configure a strong secret.');
  }

  return new TextEncoder().encode(secret);
}

/**
 * Signs a volunteer token with required event and session claims.
 */
export async function signVolunteerToken(
  payload: Omit<VolunteerJwtPayload, 'role'>
): Promise<string> {
  const secret = getVolunteerJwtSecret();
  const alg = 'HS256';

  return new jose.SignJWT({
    role: 'volunteer',
    ...payload,
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

/**
 * Verifies a volunteer JWT and ensures all required claims are present.
 */
export async function verifyVolunteerToken(token: string): Promise<VolunteerJwtPayload> {
  const secret = getVolunteerJwtSecret();
  const { payload } = await jose.jwtVerify(token, secret);

  if (
    payload.role !== 'volunteer' ||
    typeof payload.event_id !== 'string' ||
    typeof payload.event_slug !== 'string' ||
    typeof payload.session_id !== 'string' ||
    !Number.isSafeInteger(payload.session_version) ||
    typeof payload.volunteer_name !== 'string'
  ) {
    throw new Error('Volunteer token claims are incomplete or invalid');
  }

  return payload as VolunteerJwtPayload;
}
