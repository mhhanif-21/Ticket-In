import { and, eq, inArray, sql } from 'drizzle-orm';

import { checkInSessions, events, registrations, ticketGenerationJobs } from '@/db/schema';

const ACTIVE_TICKET_JOB_STATUSES = ['queued', 'publishing', 'published', 'processing', 'failed'] as const;

/**
 * Runs in the same transaction as cancellation or PIN rotation. A volunteer
 * JWT is not enough by itself: the durable session must still be active and
 * match the current event session version at scan time.
 */
export async function revokeVolunteerSessionsTx(tx: any, eventId: string, endedAt = new Date()): Promise<void> {
  await tx
    .update(checkInSessions)
    .set({ endedAt })
    .where(and(eq(checkInSessions.eventId, eventId), sql`${checkInSessions.endedAt} IS NULL`));
}

export async function cancelEventOperationalAccessTx(tx: any, eventId: string, cancelledAt = new Date()): Promise<void> {
  await revokeVolunteerSessionsTx(tx, eventId, cancelledAt);
  await tx
    .update(ticketGenerationJobs)
    .set({
      status: 'cancelled',
      lastError: 'Event cancelled before ticket issuance completed.',
      updatedAt: cancelledAt,
    })
    .where(and(
      inArray(ticketGenerationJobs.status, ACTIVE_TICKET_JOB_STATUSES),
      sql`EXISTS (
        SELECT 1 FROM ${registrations}
        WHERE ${registrations.id} = ${ticketGenerationJobs.registrationId}
          AND ${registrations.eventId} = ${eventId}
      )`,
    ));
}

export async function rotateVolunteerSessionVersionTx(tx: any, eventId: string): Promise<number> {
  const [event] = await tx
    .select({ version: events.volunteerSessionVersion })
    .from(events)
    .where(eq(events.id, eventId))
    .for('update')
    .limit(1);
  if (!event) throw new Error('Event not found');

  const nextVersion = event.version + 1;
  await tx
    .update(events)
    .set({ volunteerSessionVersion: nextVersion, updatedAt: new Date() })
    .where(eq(events.id, eventId));
  await revokeVolunteerSessionsTx(tx, eventId);
  return nextVersion;
}
