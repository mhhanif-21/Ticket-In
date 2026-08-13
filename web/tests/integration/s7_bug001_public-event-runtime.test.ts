import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { events, formFields } from '../../db/schema';

const baseUrl = process.env.PUBLIC_RUNTIME_BASE_URL || process.env.TEST_BASE_URL || 'http://127.0.0.1:3006';
const suffix = Date.now().toString();
let eventId = '';
let slug = '';

async function waitForRuntime() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/api/v1/events/missing-public-event`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Public runtime did not become reachable at ${baseUrl}`);
}

describe('BUG-001 public event runtime projection', () => {
  beforeAll(async () => {
    const [event] = await db.insert(events).values({
      name: 'Public Runtime Event',
      slug: `bug-001-runtime-${suffix}`,
      description: 'Landing page description remains public.',
      location: 'Jakarta',
      date: new Date('2026-12-12T09:00:00.000Z'),
      posterUrl: 'https://example.test/poster.png',
      capacity: 25,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'must-not-leak',
    }).returning({ id: events.id, slug: events.slug });
    eventId = event.id;
    slug = event.slug;
    await db.insert(formFields).values({
      eventId,
      fieldName: 'Organisation',
      fieldType: 'text',
      isRequired: true,
      order: 1,
    });
    await waitForRuntime();
  });

  afterAll(async () => {
    if (eventId) await db.delete(events).where(eq(events.id, eventId));
  });

  it('returns only the public DTO through the real HTTP route', async () => {
    const response = await fetch(`${baseUrl}/api/v1/events/${slug}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      name: 'Public Runtime Event',
      description: 'Landing page description remains public.',
      capacity: 25,
      formFields: [{ fieldName: 'Organisation', fieldType: 'text' }],
    });
    expect(body.data).not.toHaveProperty('id');
    expect(body.data).not.toHaveProperty('volunteerPinHash');
    expect(body.data).not.toHaveProperty('createdAt');
    expect(body.data).not.toHaveProperty('updatedAt');
    expect(body.data.formFields[0]).not.toHaveProperty('eventId');
  });

  it('keeps the public landing page renderable with the same public fields', async () => {
    const response = await fetch(`${baseUrl}/${slug}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Public Runtime Event');
    expect(html).toContain('Landing page description remains public.');
  }, 60_000);
});
