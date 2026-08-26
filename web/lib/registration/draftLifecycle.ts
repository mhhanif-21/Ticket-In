import { and, eq, sql } from 'drizzle-orm';

import { otps, registrations } from '@/db/schema';

export const CAPACITY_CONSUMING_REGISTRATION_STATUSES = ['Draft', 'Pending', 'Accepted'] as const;

/**
 * Converts only Drafts whose latest usable OTP is already expired. The caller
 * holds the event row lock, so expiry and capacity computation are serialized
 * with registration creation for that event.
 */
export async function expireStaleDraftRegistrationsForEventTx(
  tx: any,
  eventId: string,
  now = new Date(),
): Promise<number> {
  const nowIso = now.toISOString();
  const expired = await tx
    .update(registrations)
    .set({ status: 'Expired', updatedAt: now })
    .where(and(
      eq(registrations.eventId, eventId),
      eq(registrations.status, 'Draft'),
      sql`COALESCE((
        SELECT MAX(${otps.expiresAt})
        FROM ${otps}
        WHERE ${otps.registrationId} = ${registrations.id}
          AND ${otps.isUsed} = false
      ), ${nowIso}::timestamp) <= ${nowIso}::timestamp`,
    ))
    .returning({ id: registrations.id });
  return expired.length;
}

export async function expireStaleDraftRegistrations(now = new Date()): Promise<number> {
  const { db } = await import('@/db');
  const nowIso = now.toISOString();
  const expired = await db
    .update(registrations)
    .set({ status: 'Expired', updatedAt: now })
    .where(and(
      eq(registrations.status, 'Draft'),
      sql`COALESCE((
        SELECT MAX(${otps.expiresAt})
        FROM ${otps}
        WHERE ${otps.registrationId} = ${registrations.id}
          AND ${otps.isUsed} = false
      ), ${nowIso}::timestamp) <= ${nowIso}::timestamp`,
    ))
    .returning({ id: registrations.id });
  return expired.length;
}
