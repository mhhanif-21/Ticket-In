import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  registrationStatusCapabilities,
  registrations,
  ticketGenerationJobs,
} from '@/db/schema';

export const REGISTRATION_STATUS_CAPABILITY_SCOPE = 'registration-status';
export const REGISTRATION_STATUS_CAPABILITY_TTL_MS = 30 * 60 * 1000;

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface IssuedRegistrationStatusCapability {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PublicRegistrationStatus {
  status: string;
  ticketCode: string | null;
  qrCodeUrl: string | null;
  ticketJobStatus: string | null;
}

export function hashRegistrationStatusCapability(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Generates a 256-bit opaque bearer capability. Its raw value is returned to
 * the browser once; only the SHA-256 digest is persisted.
 */
export function issueRegistrationStatusCapability(
  now = new Date(),
): IssuedRegistrationStatusCapability {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashRegistrationStatusCapability(token),
    expiresAt: new Date(now.getTime() + REGISTRATION_STATUS_CAPABILITY_TTL_MS),
  };
}

/**
 * Rotating a holder proof revokes all prior active proofs for the same
 * registration. This supplies an application-level revocation path without
 * retaining the bearer value in the database.
 */
export async function rotateRegistrationStatusCapabilityTx(
  tx: any,
  registrationId: string,
  now = new Date(),
): Promise<IssuedRegistrationStatusCapability> {
  const issued = issueRegistrationStatusCapability(now);

  await tx
    .update(registrationStatusCapabilities)
    .set({ revokedAt: now })
    .where(and(
      eq(registrationStatusCapabilities.registrationId, registrationId),
      isNull(registrationStatusCapabilities.revokedAt),
    ));

  await tx.insert(registrationStatusCapabilities).values({
    registrationId,
    scope: REGISTRATION_STATUS_CAPABILITY_SCOPE,
    tokenHash: issued.tokenHash,
    expiresAt: issued.expiresAt,
  });

  return issued;
}

export function getRegistrationStatusCapabilityFromRequest(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.startsWith('Bearer ')) return null;

  const token = authorization.slice('Bearer '.length).trim();
  return OPAQUE_TOKEN_PATTERN.test(token) ? token : null;
}

export async function getPublicRegistrationStatus(
  token: string,
  expectedRegistrationId?: string,
  now = new Date(),
): Promise<PublicRegistrationStatus | null> {
  if (!OPAQUE_TOKEN_PATTERN.test(token)) return null;

  const conditions = [
    eq(registrationStatusCapabilities.tokenHash, hashRegistrationStatusCapability(token)),
    eq(registrationStatusCapabilities.scope, REGISTRATION_STATUS_CAPABILITY_SCOPE),
    isNull(registrationStatusCapabilities.revokedAt),
    gt(registrationStatusCapabilities.expiresAt, now),
  ];

  if (expectedRegistrationId) {
    conditions.push(eq(registrationStatusCapabilities.registrationId, expectedRegistrationId));
  }

  const [record] = await db
    .select({
      status: registrations.status,
      ticketCode: registrations.ticketCode,
      qrCodeUrl: registrations.qrCodeUrl,
      ticketJobStatus: ticketGenerationJobs.status,
    })
    .from(registrationStatusCapabilities)
    .innerJoin(
      registrations,
      eq(registrationStatusCapabilities.registrationId, registrations.id),
    )
    .leftJoin(
      ticketGenerationJobs,
      eq(ticketGenerationJobs.registrationId, registrations.id),
    )
    .where(and(...conditions))
    .limit(1);

  return record ?? null;
}
