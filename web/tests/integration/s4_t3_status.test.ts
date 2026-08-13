import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { events, registrations } from '../../db/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = 'http://localhost:3001';
let eventId = '';
let eventSlug = 'test-status-check-' + Date.now();
let registrationId1 = '';
let registrationId2 = '';

describe('S4-T3 Ticket Status Check', () => {
  beforeAll(async () => {
    const [e] = await db.insert(events).values({
      name: 'Status Check Event',
      slug: eventSlug,
      location: 'Online',
      date: new Date('2026-12-12'),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId = e.id;

    // Reg 1: Found, Accepted, NO QR code (Processing)
    const [r1] = await db.insert(registrations).values({
      eventId,
      name: 'John Doe',
      email: 'john@doe.com',
      status: 'Accepted'
    }).returning({ id: registrations.id });
    registrationId1 = r1.id;

    // Reg 2: Found, Accepted, HAS QR code (Completed)
    const [r2] = await db.insert(registrations).values({
      eventId,
      name: 'Jane Smith',
      email: 'jane@smith.com',
      status: 'Accepted',
      ticketCode: 'ABC123XY',
      qrCodeUrl: 'https://example.com/qr.png'
    }).returning({ id: registrations.id });
    registrationId2 = r2.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
    }
  });

  it('TDS-010: should return 404 for wrong email but correct name (prevent enumeration)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/registration/status?name=John Doe&email=wrong@email.com`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe('Data Tidak Ditemukan');
  });

  it('TDS-010: should return 404 for wrong name but correct email', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/registration/status?name=Wrong Name&email=john@doe.com`);
    expect(res.status).toBe(404);
  });

  it('should return registration details on exact match', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/registration/status?name=John Doe&email=john@doe.com`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('Accepted');
    expect(json.data.name).toBe('John Doe');
  });

  it('should return processing status when polling and QR is null', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/registration/${registrationId1}/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processing');
    expect(json.qr_code_url).toBeNull();
  });

  it('should return completed status when polling and QR is present', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/registration/${registrationId2}/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('completed');
    expect(json.qr_code_url).toBe('https://example.com/qr.png');
    expect(json.ticket_code).toBe('ABC123XY');
  });
});
