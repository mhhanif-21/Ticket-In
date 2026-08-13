import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const RESUBMIT_TOKEN_TTL_SECONDS = 15 * 60;

export interface ResubmitTokenClaims {
  registrationId: string;
  eventId: string;
  email: string;
  exp: number;
  jti: string;
}

export interface IssuedResubmitToken {
  token: string;
  claims: ResubmitTokenClaims;
  tokenHash: string;
}

function getSecret(): string {
  const configuredSecret = process.env.REGISTRATION_RESUBMIT_SECRET || process.env.JWT_SECRET;
  if (configuredSecret) return configuredSecret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REGISTRATION_RESUBMIT_SECRET is not configured');
  }
  return 'development-only-registration-resubmit-secret';
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(encodedClaims: string): string {
  return createHmac('sha256', getSecret()).update(encodedClaims).digest('base64url');
}

export function hashResubmitToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueResubmitTokenRecord(
  input: Omit<ResubmitTokenClaims, 'exp' | 'jti'>,
  now = Date.now(),
): IssuedResubmitToken {
  const claims: ResubmitTokenClaims = {
    ...input,
    email: input.email.trim().toLowerCase(),
    exp: Math.floor(now / 1000) + RESUBMIT_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const encodedClaims = encode(JSON.stringify(claims));
  const token = `${encodedClaims}.${sign(encodedClaims)}`;
  return { token, claims, tokenHash: hashResubmitToken(token) };
}

export function issueResubmitToken(
  input: Omit<ResubmitTokenClaims, 'exp' | 'jti'>,
  now = Date.now(),
): string {
  return issueResubmitTokenRecord(input, now).token;
}

function decodeAndVerifyToken(token: string | undefined, now: number): ResubmitTokenClaims | null {
  if (!token) return null;

  const [encodedClaims, providedSignature, ...extraParts] = token.split('.');
  if (!encodedClaims || !providedSignature || extraParts.length > 0) return null;

  const expectedSignature = sign(encodedClaims);
  const providedBuffer = Buffer.from(providedSignature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as Partial<ResubmitTokenClaims>;
    if (typeof claims.registrationId !== 'string'
      || typeof claims.eventId !== 'string'
      || typeof claims.email !== 'string'
      || typeof claims.exp !== 'number'
      || !Number.isInteger(claims.exp)
      || typeof claims.jti !== 'string'
      || !claims.jti
      || claims.exp <= Math.floor(now / 1000)) {
      return null;
    }
    return {
      registrationId: claims.registrationId,
      eventId: claims.eventId,
      email: claims.email,
      exp: claims.exp,
      jti: claims.jti,
    };
  } catch {
    return null;
  }
}

export function verifyResubmitToken(
  token: string | undefined,
  expected: Omit<ResubmitTokenClaims, 'exp'>,
  now = Date.now(),
): boolean {
  const claims = decodeAndVerifyToken(token, now);
  return claims !== null
    && claims.registrationId === expected.registrationId
    && claims.eventId === expected.eventId
    && claims.email === expected.email.trim().toLowerCase();
}

export function getVerifiedResubmitToken(
  token: string | undefined,
  expected: Omit<ResubmitTokenClaims, 'exp' | 'jti'>,
  now = Date.now(),
): (ResubmitTokenClaims & { tokenHash: string }) | null {
  const claims = decodeAndVerifyToken(token, now);
  if (!claims
    || claims.registrationId !== expected.registrationId
    || claims.eventId !== expected.eventId
    || claims.email !== expected.email.trim().toLowerCase()) {
    return null;
  }
  return { ...claims, tokenHash: hashResubmitToken(token!) };
}
