import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events, exportJobs, registrations, ticketGenerationJobs } from '../../db/schema';
import { configureTestQStashKeys, qstashSignature } from '../helpers/qstash';

const baseUrl = process.env.WORKER_RUNTIME_BASE_URL || process.env.TEST_BASE_URL || 'http://127.0.0.1:3005';
const suffix = Date.now().toString();
let eventId = '';
let registrationId = '';
let exportJobId = '';

async function request(path: string, body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['Upstash-Signature'] = signature;
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers, body });
}

async function waitForRuntime(): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/api/v1/worker/export`, { method: 'POST', body: '{}' });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Worker runtime did not become reachable at ${baseUrl}`);
}

describe('BUG-007 QStash worker runtime boundary', () => {
  beforeAll(async () => {
    configureTestQStashKeys();
    const [event] = await db.insert(events).values({
      name: 'Worker Runtime Event',
      slug: `bug-007-runtime-${suffix}`,
      location: 'Jakarta',
      date: new Date(),
      capacity: 10,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = event.id;

    const [registration] = await db.insert(registrations).values({
      eventId,
      name: 'Runtime Worker User',
      email: `worker-${suffix}@example.test`,
      status: 'Accepted',
      ticketCode: `RT${suffix.slice(-6)}`,
      qrCodeUrl: 'https://example.test/qr.png',
    }).returning({ id: registrations.id });
    registrationId = registration.id;

    await db.insert(ticketGenerationJobs).values({ registrationId, status: 'published' });
    const [exportJob] = await db.insert(exportJobs).values({ eventId, status: 'pending' }).returning({ id: exportJobs.id });
    exportJobId = exportJob.id;
    await waitForRuntime();
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('rejects process-ticket without signature after middleware bypass', async () => {
    const response = await request('/api/v1/worker/process-ticket', JSON.stringify({ registration_id: registrationId }));
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe('Unauthorized webhook call');
  });

  it('rejects process-ticket with an invalid signature', async () => {
    const response = await request('/api/v1/worker/process-ticket', JSON.stringify({ registration_id: registrationId }), 'invalid-signature');
    expect(response.status).toBe(401);
  });

  it('accepts process-ticket with a valid QStash signature and no application JWT', async () => {
    const body = JSON.stringify({ registration_id: registrationId });
    const response = await request('/api/v1/worker/process-ticket', body, await qstashSignature(body));
    expect(response.status).toBe(200);
    const [job] = await db.select().from(ticketGenerationJobs).where(eq(ticketGenerationJobs.registrationId, registrationId));
    expect(job.status).toBe('completed');
  });

  it('returns 400 for a validly signed process-ticket payload with no registration ID', async () => {
    const body = JSON.stringify({});
    const response = await request('/api/v1/worker/process-ticket', body, await qstashSignature(body));
    expect(response.status).toBe(400);
  });

  it('rejects export without signature', async () => {
    const response = await request('/api/v1/worker/export', JSON.stringify({ job_id: exportJobId, event_id: eventId }));
    expect(response.status).toBe(401);
  });

  it('rejects export with an invalid signature', async () => {
    const response = await request('/api/v1/worker/export', JSON.stringify({ job_id: exportJobId, event_id: eventId }), 'invalid-signature');
    expect(response.status).toBe(401);
  });

  it('accepts export with a valid QStash signature and no application JWT', async () => {
    const body = JSON.stringify({ job_id: exportJobId, event_id: eventId });
    const response = await request('/api/v1/worker/export', body, await qstashSignature(body));
    expect(response.status).toBe(200);
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, exportJobId));
    expect(job.status).toBe('completed');
    expect(job.fileUrl).toMatch(/^data:text\/csv;base64,/);
  });

  it('returns 400 for a validly signed export payload with missing IDs', async () => {
    const body = JSON.stringify({});
    const response = await request('/api/v1/worker/export', body, await qstashSignature(body));
    expect(response.status).toBe(400);
  });
});
