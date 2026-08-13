import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { events, otps, registrations } from '../../db/schema';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(),
    },
  },
}));

import { POST } from '../../app/api/v1/events/[id]/register/route';
import * as emailService from '../../lib/email';

const suffix = Date.now().toString();
const slug = `bug-006-${suffix}`;
let eventId = '';

function registrationRequest() {
  const formData = new FormData();
  formData.set('name', 'OTP Retry');
  formData.set('email', 'otp-retry@example.test');
  return new Request(`http://localhost/api/v1/events/${slug}/register`, { method: 'POST', body: formData });
}

describe('BUG-006 OTP delivery retry', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({ name: 'OTP Retry Event', slug, location: 'Jakarta', date: new Date(), capacity: 10, registrationMode: 'Manual Review', volunteerPinHash: 'hash' }).returning({ id: events.id });
    eventId = event.id;
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('keeps one Draft registration and invalidates the prior OTP when delivery is retried', async () => {
    const emailSpy = vi.spyOn(emailService, 'sendOtpEmail')
      .mockRejectedValueOnce(new Error('Brevo timeout'))
      .mockResolvedValueOnce(undefined);

    const failedResponse = await POST(registrationRequest() as any, { params: Promise.resolve({ id: slug }) });
    expect(failedResponse.status).toBe(503);
    const failedBody = await failedResponse.json();
    expect(failedBody).toMatchObject({ data: { status: 'Draft', otp_delivery: 'failed', retryable: true } });
    expect(failedBody.data.resubmitToken).toEqual(expect.any(String));

    const successfulResponse = await POST(registrationRequest() as any, { params: Promise.resolve({ id: slug }) });
    expect(successfulResponse.status).toBe(201);
    const successfulBody = await successfulResponse.json();
    expect(successfulBody.data.resubmitToken).toEqual(expect.any(String));
    expect(successfulBody.data.resubmitToken).not.toBe(failedBody.data.resubmitToken);

    const registrationsForEmail = await db.select().from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.email, 'otp-retry@example.test')));
    expect(registrationsForEmail).toHaveLength(1);
    const registrationOtps = await db.select().from(otps).where(eq(otps.registrationId, registrationsForEmail[0].id));
    expect(registrationOtps).toHaveLength(2);
    expect(registrationOtps.filter((otp) => !otp.isUsed)).toHaveLength(1);
    expect(emailSpy).toHaveBeenCalledTimes(2);
    emailSpy.mockRestore();
  });
});
