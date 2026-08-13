import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events, registrations, ticketGenerationJobs } from '../../db/schema';
import { POST } from '../../app/api/v1/registrations/[id]/review/route';
import { POST as register } from '../../app/api/v1/events/[id]/register/route';
import * as qstash from '../../lib/services/qstash';
import { NextRequest } from 'next/server';

vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));

const suffix = Date.now().toString();
let eventId = '';
let registrationId = '';
let autoEventId = '';
const autoSlug = `bug-009-auto-${suffix}`;

describe('BUG-009 QStash publish failure', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'Retry Event', slug: `bug-009-${suffix}`, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Manual Review', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
    const [registration] = await db.insert(registrations).values({ eventId, name: 'Pending User', email: `pending-${suffix}@example.test`, status: 'Pending' }).returning({ id: registrations.id });
    registrationId = registration.id;
  });

  afterAll(async () => {
    const ids = [eventId, autoEventId].filter(Boolean);
    if (ids.length) await db.delete(events).where(eq(events.id, ids[0]));
    if (autoEventId) await db.delete(events).where(eq(events.id, autoEventId));
  });

  it('returns a retryable failure instead of silently succeeding, then republishes safely on retry', async () => {
    const publishSpy = vi.spyOn(qstash, 'publishJob').mockRejectedValueOnce(new Error('QStash unavailable')).mockResolvedValueOnce({ messageId: 'retry-message', url: 'https://qstash.test/retry' });
    const request = () => new Request(`http://localhost/api/v1/registrations/${registrationId}/review`, { method: 'POST', body: JSON.stringify({ action: 'Approve' }) });

    expect((await POST(request(), { params: Promise.resolve({ id: registrationId }) })).status).toBe(503);
    const [accepted] = await db.select().from(registrations).where(eq(registrations.id, registrationId));
    expect(accepted?.status).toBe('Accepted');
    const [failedJob] = await db.select().from(ticketGenerationJobs).where(eq(ticketGenerationJobs.registrationId, registrationId));
    expect(failedJob).toMatchObject({ status: 'failed', attempts: 1, lastError: 'QStash unavailable' });

    expect((await POST(request(), { params: Promise.resolve({ id: registrationId }) })).status).toBe(200);
    expect(publishSpy).toHaveBeenCalledTimes(2);
    const jobs = await db.select().from(ticketGenerationJobs).where(eq(ticketGenerationJobs.registrationId, registrationId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'published', attempts: 2, qstashMessageId: 'retry-message' });
    publishSpy.mockRestore();
  });

  it('reuses the Auto-Accept registration and its single job when the client retries after publish failure', async () => {
    const [event] = await db.insert(events).values({ name: 'Auto Retry Event', slug: autoSlug, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Auto-Accept', volunteerPinHash: 'hash' }).returning({ id: events.id });
    autoEventId = event.id;
    const publishSpy = vi.spyOn(qstash, 'publishJob')
      .mockRejectedValueOnce(new Error('QStash unavailable'))
      .mockResolvedValueOnce({ messageId: 'auto-retry-message', url: 'https://qstash.test/auto-retry' });

    const request = () => {
      const formData = new FormData();
      formData.append('name', 'Auto Retry User');
      formData.append('email', 'auto-retry@example.test');
      return register(new NextRequest(`http://localhost/api/v1/events/${autoSlug}/register`, { method: 'POST', body: formData }), { params: Promise.resolve({ id: autoSlug }) });
    };

    expect((await request()).status).toBe(503);
    expect((await request()).status).toBe(201);

    const registrationsForEmail = await db.select().from(registrations).where(eq(registrations.eventId, autoEventId));
    expect(registrationsForEmail).toHaveLength(1);
    const [autoRegistration] = registrationsForEmail;
    expect(autoRegistration).toBeDefined();
    const jobs = await db.select().from(ticketGenerationJobs).where(eq(ticketGenerationJobs.registrationId, autoRegistration!.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'published', attempts: 2, qstashMessageId: 'auto-retry-message' });
    expect(publishSpy).toHaveBeenCalledTimes(2);
    publishSpy.mockRestore();
  });
});
