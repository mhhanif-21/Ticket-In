import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { events, registrations, otps } from '../../db/schema';

const BASE_URL = 'http://localhost:3001';
let eventId1 = '';
let eventSlug1 = 'test-race-condition-' + Date.now();

let eventId2 = '';
let eventSlug2 = 'test-otp-' + Date.now();

let eventId3 = '';
let eventSlug3 = 'test-file-' + Date.now();

let eventId4 = '';
let eventSlug4 = 'test-quota-' + Date.now();

describe('S4-T2 Registration Integration', () => {
  beforeAll(async () => {
    // Insert mock events directly to DB for speed
    const [e1] = await db.insert(events).values({
      name: 'Konser A',
      slug: eventSlug1,
      location: 'Jakarta',
      date: new Date('2026-10-10'),
      capacity: 1, // Only 1 slot for race condition test
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId1 = e1.id;

    const [e2] = await db.insert(events).values({
      name: 'Event OTP',
      slug: eventSlug2,
      location: 'Jakarta',
      date: new Date('2026-10-10'),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId2 = e2.id;

    const [e3] = await db.insert(events).values({
      name: 'Event File',
      slug: eventSlug3,
      location: 'Jakarta',
      date: new Date('2026-10-10'),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId3 = e3.id;

    const [e4] = await db.insert(events).values({
      name: 'Event Quota Rejected',
      slug: eventSlug4,
      location: 'Jakarta',
      date: new Date('2026-10-10'),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hash',
    }).returning({ id: events.id });
    eventId4 = e4.id;
  });

  afterAll(async () => {
    if (eventId1 || eventId2 || eventId3 || eventId4) {
      await db.delete(events).where(inArray(events.id, [eventId1, eventId2, eventId3, eventId4].filter(Boolean)));
    }
  });

  // TDS-001
  it('TDS-001: Mencegah Overbooking saat Race Condition', async () => {
    // 5 concurrent requests
    const promises = Array.from({ length: 5 }).map((_, i) => {
      const formData = new FormData();
      formData.append('name', `Peserta ${i}`);
      formData.append('email', `peserta${i}@test.com`);
      
      return fetch(`${BASE_URL}/api/v1/events/${eventSlug1}/register`, {
        method: 'POST',
        body: formData,
      });
    });

    const responses = await Promise.all(promises);
    
    let successCount = 0;
    let failCount = 0;

    for (const res of responses) {
      if (res.status === 201) successCount++;
      else if (res.status === 400) failCount++;
    }

    expect(successCount).toBe(1);
    expect(failCount).toBe(4);
  });

  // TDS-006
  it('TDS-006: Kedaluwarsa dan Re-use OTP', async () => {
    // Register to get OTP
    const formData = new FormData();
    formData.append('name', `Peserta OTP`);
    formData.append('email', `otp@test.com`);
    
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventSlug2}/register`, {
      method: 'POST',
      body: formData,
    });
    
    expect(res.status).toBe(201);
    const body = await res.json();
    const registrationId = body.data.id;

    // Manually set OTP to expired in DB
    const [otpRecord] = await db.select().from(otps).where(eq(otps.registrationId, registrationId));
    
    await db.update(otps)
      .set({ expiresAt: new Date(Date.now() - 1000) }) // Expired 1 second ago
      .where(eq(otps.id, otpRecord.id));

    // Verify expired OTP
    const verifyRes = await fetch(`${BASE_URL}/api/v1/registrations/${registrationId}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp_code: otpRecord.otpCode })
    });

    expect(verifyRes.status).toBe(400);

    // Now set it to used but not expired
    await db.update(otps)
      .set({ 
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: true
      })
      .where(eq(otps.id, otpRecord.id));

    const verifyRes2 = await fetch(`${BASE_URL}/api/v1/registrations/${registrationId}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp_code: otpRecord.otpCode })
    });

    expect(verifyRes2.status).toBe(400);

    // Verify registration is still Draft
    const [regRecord] = await db.select().from(registrations).where(eq(registrations.id, registrationId));
    expect(regRecord.status).toBe('Draft');
  });

  // TDS-007
  it('TDS-007: Validasi Ukuran Maksimal File Unggahan', async () => {
    const formData = new FormData();
    formData.append('name', 'Peserta File Besar');
    formData.append('email', 'bigfile@test.com');
    
    // Create a large mock file (1.5 MB)
    const largeContent = new Uint8Array(1.5 * 1024 * 1024);
    const blob = new Blob([largeContent], { type: 'image/jpeg' });
    formData.append('file_upload', blob, 'large_image.jpg');

    const res = await fetch(`${BASE_URL}/api/v1/events/${eventSlug3}/register`, {
      method: 'POST',
      body: formData,
    });

    expect([413, 422]).toContain(res.status);
  });

  // TDS-011
  it('TDS-011: Perhitungan Kuota dengan Status Campuran (Rejected diabaikan)', async () => {
    // Insert 50 Accepted, 20 Draft, 40 Rejected
    const inserts = [];
    for (let i = 0; i < 50; i++) {
      inserts.push({ eventId: eventId4, name: `A${i}`, email: `a${i}@t.com`, status: 'Accepted' as const });
    }
    for (let i = 0; i < 20; i++) {
      inserts.push({ eventId: eventId4, name: `D${i}`, email: `d${i}@t.com`, status: 'Draft' as const });
    }
    for (let i = 0; i < 40; i++) {
      inserts.push({ eventId: eventId4, name: `R${i}`, email: `r${i}@t.com`, status: 'Rejected' as const });
    }
    
    await db.insert(registrations).values(inserts);

    // Now currentCount is 70. Capacity is 100.
    // Try to register 1 more. Should succeed.
    const formData = new FormData();
    formData.append('name', 'Peserta Baru');
    formData.append('email', 'baru@test.com');
    
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventSlug4}/register`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
  });
});
