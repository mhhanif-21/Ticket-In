import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { GET } from '../../app/api/v1/events/[id]/registrations/route';
import { POST } from '../../app/api/v1/registrations/[id]/review/route';
import * as qstash from '../../lib/services/qstash';
import { NextRequest } from 'next/server';

let eventId = '';
let registrationIdPending = '';
let registrationIdDraft = '';

describe('S5-T1 Admin Participant Review', () => {
  beforeAll(async () => {
    // Setup test data
    const [e] = await db.insert(events).values({
      name: 'Admin Review Event',
      slug: 'admin-review-' + Date.now(),
      location: 'HQ',
      date: new Date('2026-12-12'),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = e.id;

    const [r1] = await db.insert(registrations).values({
      eventId,
      name: 'Alice Pending',
      email: 'alice@test.com',
      status: 'Pending'
    }).returning({ id: registrations.id });
    registrationIdPending = r1.id;

    const [r2] = await db.insert(registrations).values({
      eventId,
      name: 'Bob Pending',
      email: 'bob@test.com',
      status: 'Pending'
    }).returning({ id: registrations.id });
    registrationIdDraft = r2.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  describe('GET /registrations (Filters)', () => {
    it('should return 400 when mutually exclusive filters are combined', async () => {
      // Combining status and attendance
      const req = new NextRequest(`http://localhost:3000/api/v1/events/${eventId}/registrations?status=Pending&attendance=true`);
      const res = await GET(req as any, { params: Promise.resolve({ id: eventId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('Hanya satu jenis filter');
    });

    it('should return results when using single search filter', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/events/${eventId}/registrations?search=Alice`);
      const res = await GET(req as any, { params: Promise.resolve({ id: eventId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBe(1);
      expect(json.data[0].name).toBe('Alice Pending');
    });
  });

  describe('POST /review (Approve/Reject)', () => {
    it('should reject a Pending registration', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/registrations/${registrationIdDraft}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'Reject' })
      });
      const res = await POST(req as any, { params: Promise.resolve({ id: registrationIdDraft }) });
      expect(res.status).toBe(200);
      
      const dbCheck = await db.select().from(registrations).where(eq(registrations.id, registrationIdDraft));
      expect(dbCheck[0].status).toBe('Rejected');
    });

    it('should approve a pending registration and trigger QStash', async () => {
      const qstashMock = vi.spyOn(qstash, 'publishJob').mockResolvedValue({ messageId: 'msg-123', url: 'https://qstash.test/message' });

      const req = new NextRequest(`http://localhost:3000/api/v1/registrations/${registrationIdPending}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'Approve' })
      });
      const res = await POST(req as any, { params: Promise.resolve({ id: registrationIdPending }) });
      expect(res.status).toBe(200);

      const dbCheck = await db.select().from(registrations).where(eq(registrations.id, registrationIdPending));
      expect(dbCheck[0].status).toBe('Accepted');

      // Verify QStash was called
      expect(qstashMock).toHaveBeenCalledTimes(1);
      expect(qstashMock).toHaveBeenCalledWith(expect.objectContaining({
        body: { registration_id: registrationIdPending }
      }));

      qstashMock.mockRestore();
    });
  });
});
