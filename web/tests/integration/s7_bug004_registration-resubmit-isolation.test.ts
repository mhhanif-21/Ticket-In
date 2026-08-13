import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '../../db';
import { events, otps, registrations, resubmitTokens } from '../../db/schema';
import { processRegistrationAction, verifyOtpAction } from '../../lib/actions/processRegistrationAction';
import { hashResubmitToken, issueResubmitToken } from '../../lib/security/resubmit';
import { POST as register } from '../../app/api/v1/events/[id]/register/route';
import * as emailService from '../../lib/email';

const suffix = Date.now().toString();
const eventASlug = `bug-004-a-${suffix}`;
const eventBSlug = `bug-004-b-${suffix}`;
let eventAId = '';
let eventBId = '';

type DraftProof = {
  registrationId: string;
  token: string;
  otpCode: string;
};

async function createDraft(email: string, name = 'Draft Owner'): Promise<DraftProof> {
  const result = await processRegistrationAction(eventASlug, {
    name,
    email,
    answers: {},
  });
  if (result.status !== 'Draft' || !result.resubmitToken || !result.otpCode) {
    throw new Error('Test setup did not create a Draft proof');
  }
  return {
    registrationId: result.registrationId,
    token: result.resubmitToken,
    otpCode: result.otpCode,
  };
}

function registrationRequest(slug: string, values: Record<string, string>): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return new NextRequest(`http://localhost/api/v1/events/${slug}/register`, {
    method: 'POST',
    body: formData,
  });
}

describe('BUG-004 registration resubmit isolation and one-time proofs', () => {
  beforeAll(async () => {
    const [eventA] = await db.insert(events).values({
      name: 'Event A',
      slug: eventASlug,
      location: 'Jakarta',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    const [eventB] = await db.insert(events).values({
      name: 'Event B',
      slug: eventBSlug,
      location: 'Bandung',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventAId = eventA.id;
    eventBId = eventB.id;
  });

  afterAll(async () => {
    await db.delete(events).where(inArray(events.id, [eventAId, eventBId].filter(Boolean)));
  });

  it('valid token succeeds once, rotates, and the replay returns 409 without mutation', async () => {
    const proof = await createDraft('replay@example.test');
    const first = await processRegistrationAction(eventASlug, {
      name: 'First Update',
      email: 'replay@example.test',
      answers: {},
      registrationId: proof.registrationId,
      resubmitToken: proof.token,
    });

    expect(first.registrationId).toBe(proof.registrationId);
    expect(first.resubmitToken).toBeTruthy();
    expect(first.resubmitToken).not.toBe(proof.token);

    await expect(processRegistrationAction(eventASlug, {
      name: 'Replay Attempt',
      email: 'replay@example.test',
      answers: {},
      registrationId: proof.registrationId,
      resubmitToken: proof.token,
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const [registration] = await db.select().from(registrations).where(eq(registrations.id, proof.registrationId));
    expect(registration).toMatchObject({ name: 'First Update', email: 'replay@example.test', status: 'Draft' });

    const storedTokens = await db.select().from(resubmitTokens).where(eq(resubmitTokens.registrationId, proof.registrationId));
    expect(storedTokens).toHaveLength(2);
    expect(storedTokens.find((row) => row.tokenHash === hashResubmitToken(proof.token))?.usedAt).toBeTruthy();
    expect(storedTokens.every((row) => !Object.values(row).includes(proof.token))).toBe(true);
  });

  it('two concurrent requests using one token produce exactly one success', async () => {
    const proof = await createDraft('concurrent@example.test');
    const request = () => processRegistrationAction(eventASlug, {
      name: 'Concurrent Update',
      email: 'concurrent@example.test',
      answers: {},
      registrationId: proof.registrationId,
      resubmitToken: proof.token,
    });

    const results = await Promise.allSettled([request(), request()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.message).toContain('InvalidRegistrationResubmit');

    const [registration] = await db.select().from(registrations).where(eq(registrations.id, proof.registrationId));
    expect(registration.name).toBe('Concurrent Update');
    const [oldToken] = await db.select().from(resubmitTokens).where(and(
      eq(resubmitTokens.registrationId, proof.registrationId),
      eq(resubmitTokens.tokenHash, hashResubmitToken(proof.token)),
    ));
    expect(oldToken.usedAt).toBeTruthy();
  });

  it('rejects UUID-only mutation through both action and HTTP route', async () => {
    const proof = await createDraft('uuid-only@example.test');
    await expect(processRegistrationAction(eventASlug, {
      name: 'UUID Attacker',
      email: 'attacker@example.test',
      registrationId: proof.registrationId,
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const response = await register(registrationRequest(eventASlug, {
      name: 'UUID Route Attacker',
      email: 'attacker@example.test',
      registration_id: proof.registrationId,
    }), { params: Promise.resolve({ id: eventASlug }) });
    expect(response.status).toBe(409);

    const [registration] = await db.select().from(registrations).where(eq(registrations.id, proof.registrationId));
    expect(registration).toMatchObject({ name: 'Draft Owner', email: 'uuid-only@example.test', status: 'Draft' });
  });

  it('accepts a valid HTTP resubmit and rejects replay of that same token', async () => {
    const emailSpy = vi.spyOn(emailService, 'sendOtpEmail').mockResolvedValue(undefined);
    const proof = await createDraft('route-owner@example.test');
    const response = await register(registrationRequest(eventASlug, {
      name: 'Route Updated',
      email: 'route-owner@example.test',
      registration_id: proof.registrationId,
      resubmit_token: proof.token,
    }), { params: Promise.resolve({ id: eventASlug }) });
    expect(response.status).toBe(201);
    const responseBody = await response.json();
    expect(responseBody.data.resubmitToken).toBeTruthy();

    const replayResponse = await register(registrationRequest(eventASlug, {
      name: 'Route Replay',
      email: 'route-owner@example.test',
      registration_id: proof.registrationId,
      resubmit_token: proof.token,
    }), { params: Promise.resolve({ id: eventASlug }) });
    expect(replayResponse.status).toBe(409);
    emailSpy.mockRestore();
  });

  it('rejects malformed, expired, event-mismatched, and email-mismatched proofs', async () => {
    const malformed = await createDraft('malformed@example.test');
    await expect(processRegistrationAction(eventASlug, {
      name: 'Malformed', email: 'malformed@example.test', registrationId: malformed.registrationId, resubmitToken: 'not-signed',
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const expired = await createDraft('expired@example.test');
    const expiredToken = issueResubmitToken({ registrationId: expired.registrationId, eventId: eventAId, email: 'expired@example.test' }, Date.now() - (16 * 60 * 1000));
    await expect(processRegistrationAction(eventASlug, {
      name: 'Expired', email: 'expired@example.test', registrationId: expired.registrationId, resubmitToken: expiredToken,
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const eventMismatch = await createDraft('event-mismatch@example.test');
    const eventMismatchToken = issueResubmitToken({ registrationId: eventMismatch.registrationId, eventId: eventBId, email: 'event-mismatch@example.test' });
    await expect(processRegistrationAction(eventASlug, {
      name: 'Event Mismatch', email: 'event-mismatch@example.test', registrationId: eventMismatch.registrationId, resubmitToken: eventMismatchToken,
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const emailMismatch = await createDraft('email-mismatch@example.test');
    const emailMismatchToken = issueResubmitToken({ registrationId: emailMismatch.registrationId, eventId: eventAId, email: 'other@example.test' });
    await expect(processRegistrationAction(eventASlug, {
      name: 'Email Mismatch', email: 'email-mismatch@example.test', registrationId: emailMismatch.registrationId, resubmitToken: emailMismatchToken,
    })).rejects.toThrow('InvalidRegistrationResubmit');
  });

  it.each(['Pending', 'Accepted', 'Rejected'] as const)('rejects a token for a %s registration', async (status) => {
    const proof = await createDraft(`${status.toLowerCase()}@example.test`);
    await db.update(registrations).set({ status }).where(eq(registrations.id, proof.registrationId));

    await expect(processRegistrationAction(eventASlug, {
      name: 'Final State Mutation',
      email: `${status.toLowerCase()}@example.test`,
      registrationId: proof.registrationId,
      resubmitToken: proof.token,
    })).rejects.toThrow('InvalidRegistrationResubmit');
  });

  it('invalidates the proof atomically when OTP verification changes Draft to Pending', async () => {
    const proof = await createDraft('otp-invalidate@example.test');
    await verifyOtpAction(proof.registrationId, proof.otpCode);

    await expect(processRegistrationAction(eventASlug, {
      name: 'After OTP',
      email: 'otp-invalidate@example.test',
      registrationId: proof.registrationId,
      resubmitToken: proof.token,
    })).rejects.toThrow('InvalidRegistrationResubmit');

    const [registration] = await db.select().from(registrations).where(eq(registrations.id, proof.registrationId));
    expect(registration.status).toBe('Pending');
    const [token] = await db.select().from(resubmitTokens).where(and(
      eq(resubmitTokens.registrationId, proof.registrationId),
      eq(resubmitTokens.tokenHash, hashResubmitToken(proof.token)),
    ));
    expect(token.usedAt).toBeTruthy();
    expect(await db.select().from(otps).where(eq(otps.registrationId, proof.registrationId))).toHaveLength(1);
  });
});
