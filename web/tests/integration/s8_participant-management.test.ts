import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { GET } from '../../app/api/v1/events/[id]/registrations/route';
import { NextRequest } from 'next/server';

const suffix = Date.now().toString();
let eventId = '';

describe('Participant management contract', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({
      name: 'Participant Management Event',
      slug: `participant-management-${suffix}`,
      location: 'Jakarta',
      date: new Date('2026-12-31'),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = event.id;

    await db.insert(registrations).values([
      {
        eventId,
        name: 'A&B Participant',
        email: `special-${suffix}@example.test`,
        status: 'Pending',
        answers: { field1: 18 },
        answerFieldLabels: { field1: 'Umur' },
        createdAt: new Date('2026-08-25T23:00:00.000Z'),
      },
      {
        eventId,
        name: 'Older Participant',
        email: `older-${suffix}@example.test`,
        status: 'Rejected',
        createdAt: new Date('2026-08-24T23:00:00.000Z'),
      },
    ]);
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('encodes and matches special characters in participant search', async () => {
    const url = new URL(`http://localhost/api/v1/events/${eventId}/registrations`);
    url.searchParams.set('search', 'A&B');
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ id: eventId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('A&B Participant');
  });

  it('includes the complete date-only end day and preserves answer labels', async () => {
    const url = new URL(`http://localhost/api/v1/events/${eventId}/registrations`);
    url.searchParams.set('start_date', '2026-08-25');
    url.searchParams.set('end_date', '2026-08-25');
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ id: eventId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].answerFieldLabels).toEqual({ field1: 'Umur' });
  });

  it('returns 400 for invalid participant list parameters', async () => {
    const invalidUrls = [
      `http://localhost/api/v1/events/${eventId}/registrations?limit=0`,
      `http://localhost/api/v1/events/${eventId}/registrations?status=Unknown`,
      `http://localhost/api/v1/events/${eventId}/registrations?end_date=2026-02-30`,
      `http://localhost/api/v1/events/${eventId}/registrations?status=Pending&attendance=true`,
    ];

    for (const url of invalidUrls) {
      const response = await GET(new NextRequest(url), { params: Promise.resolve({ id: eventId }) });
      expect(response.status).toBe(400);
    }
  });
});
