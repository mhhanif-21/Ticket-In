import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { events } from '../../db/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

describe('QA-BUG-005: public registration URL untuk event minimal', () => {
  let eventId: string;
  let eventSlug: string;

  beforeAll(async () => {
    eventSlug = `qa-bug-005-${Date.now()}`;
    const [event] = await db.insert(events).values({
      name: 'QA Bug 005 Minimal Event',
      slug: eventSlug,
      location: 'Jakarta',
      date: new Date(),
      capacity: 50,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'qa-only-hash',
    }).returning();
    eventId = event.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('harus mengembalikan URL registration dan QR yang memakai slug event tanpa custom field', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/events/${eventId}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    const event = body.data;

    expect(body).toMatchObject({ status: 'success' });

    expect(event.formFields).toEqual([]);
    expect(event.public_registration_url).toBe(`${PUBLIC_APP_URL}/${eventSlug}/register`);
    expect(event.public_qr_code_url).toBe(`${PUBLIC_APP_URL}/api/v1/events/${eventSlug}/qr`);

    const qrResponse = await fetch(`${BASE_URL}/api/v1/events/${eventSlug}/qr`);
    expect(qrResponse.status).toBe(200);
    expect(qrResponse.headers.get('content-type')).toMatch(/^image\/png/);
    expect(new Uint8Array(await qrResponse.arrayBuffer()).slice(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
});
