import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations, exportJobs } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { configureTestQStashKeys, qstashSignature } from '../helpers/qstash';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('S7-T2: Export Participants (CSV)', () => {
  let adminToken: string;
  let eventId: string;
  let createdJobId: string;

  beforeAll(async () => {
    configureTestQStashKeys();
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' }),
    });
    expect(loginResponse.status).toBe(200);
    adminToken = (await loginResponse.json()).data.access_token;

    // Create Event
    const [event] = await db.insert(events).values({
      name: `Export Test Event`,
      slug: `export-test-${Date.now()}`,
      location: 'Virtual',
      date: new Date(),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning();
    eventId = event.id;

    // Create Registrations with custom jsonb answers
    await db.insert(registrations).values([
      {
        eventId: event.id,
        name: 'John Doe',
        email: 'john@test.com',
        status: 'Accepted',
        ticketCode: `EX1${Date.now().toString().slice(-5)}`,
        presenceStatus: 'Present',
        answers: { 'Instansi': 'PT ABC', 'No HP': '081234' }
      },
      {
        eventId: event.id,
        name: 'Jane Doe',
        email: 'jane@test.com',
        status: 'Pending',
        ticketCode: `EX2${Date.now().toString().slice(-5)}`,
        presenceStatus: 'Absent',
        answers: { 'Instansi': 'PT XYZ', 'Alamat': 'Jl. Buntu' } // Different structure to test flattening
      }
    ]);
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId)); // cascades
    }
  });

  it('should trigger an export job and return job_id asynchronously', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/export`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('success');
    expect(data.data.job_id).toBeDefined();

    createdJobId = data.data.job_id;

    // Verify it was inserted in DB as pending
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, createdJobId));
    expect(job).toBeDefined();
    expect(job.status).toBe('pending');
  });

  it('worker should process the export and flatten custom fields to CSV', async () => {
    // Simulate QStash webhook
    const body = JSON.stringify({ job_id: createdJobId, event_id: eventId });
    const res = await fetch(`${BASE_URL}/api/v1/worker/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Upstash-Signature': await qstashSignature(body),
      },
      body,
    });

    expect(res.status).toBe(200);

    // Verify job is completed and fileUrl is generated
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, createdJobId));
    expect(job.status).toBe('completed');
    expect(job.fileUrl).toMatch(/^data:text\/csv;base64,/);
  });

  it('should be able to check export status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/exports/${createdJobId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.data.status).toBe('completed');
    expect(data.data.file_url).toBeDefined();
  });
});
