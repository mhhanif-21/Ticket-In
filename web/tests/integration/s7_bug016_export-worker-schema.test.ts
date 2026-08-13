import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events, exportJobs, registrations } from '../../db/schema';
import { configureTestQStashKeys, qstashSignature } from '../helpers/qstash';
import { POST } from '../../app/api/v1/worker/export/route';

const suffix = Date.now().toString();
let eventId = '';
let jobId = '';

describe('BUG-016 export worker schema contract', () => {
  beforeAll(async () => {
    configureTestQStashKeys();
    const [event] = await db.insert(events).values({
      name: 'Export Schema Event',
      slug: `bug-016-${suffix}`,
      location: 'Jakarta',
      date: new Date(),
      capacity: 10,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = event.id;
    const [job] = await db.insert(exportJobs).values({ eventId, status: 'pending' }).returning({ id: exportJobs.id });
    jobId = job.id;
    await db.insert(registrations).values({
      eventId,
      name: 'Export User',
      email: `export-${suffix}@example.test`,
      status: 'Accepted',
      answers: { Department: 'QA' },
    });
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('moves pending to completed with a real QStash signature and no updatedAt write', async () => {
    const body = JSON.stringify({ job_id: jobId, event_id: eventId });
    const response = await POST(new Request('http://localhost/api/v1/worker/export', {
      method: 'POST',
      headers: { 'Upstash-Signature': await qstashSignature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId));
    expect(job.status).toBe('completed');
    expect(job.fileUrl).toMatch(/^data:text\/csv;base64,/);
  });
});
