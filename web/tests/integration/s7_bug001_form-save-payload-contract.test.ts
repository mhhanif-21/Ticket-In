import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { events, formFields } from '../../db/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('QA-BUG-001: payload save form dari Flutter', () => {
  let eventId: string;
  let adminToken = '';

  beforeAll(async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' }),
    });
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    adminToken = loginBody.data.access_token;

    const [event] = await db.insert(events).values({
      name: 'QA Bug 001 Payload Contract',
      slug: `qa-bug-001-${Date.now()}`,
      location: 'Jakarta',
      date: new Date(),
      capacity: 100,
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

  it('harus menerima payload snake_case aktual Flutter melalui HTTP route', async () => {
    const mobilePayload = [
      { field_name: 'Nama', field_type: 'text', is_required: true, options: null, order: 0 },
      { field_name: 'Email', field_type: 'email', is_required: true, options: null, order: 1 },
      { field_name: 'Usia', field_type: 'number', is_required: false, options: null, order: 2 },
      { field_name: 'Sesi', field_type: 'select', is_required: false, options: ['Pagi', 'Sore'], order: 3 },
      { field_name: 'Pilihan', field_type: 'radio', is_required: false, options: ['A', 'B'], order: 4 },
      { field_name: 'Persetujuan', field_type: 'checkbox', is_required: false, options: ['Ya'], order: 5 },
      { field_name: 'Catatan', field_type: 'textarea', is_required: false, options: null, order: 6 },
      { field_name: 'Lampiran', field_type: 'file', is_required: false, options: null, order: 7 },
      { field_name: 'Foto', field_type: 'image', is_required: false, options: null, order: 8 },
    ];

    const response = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ fields: mobilePayload }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'success' });

    const savedFields = await db
      .select()
      .from(formFields)
      .where(eq(formFields.eventId, eventId));

    expect(savedFields).toHaveLength(9);
    expect(savedFields.map((field) => field.fieldName)).toEqual([
      'Nama', 'Email', 'Usia', 'Sesi', 'Pilihan', 'Persetujuan', 'Catatan', 'Lampiran', 'Foto',
    ]);
    expect(savedFields.map((field) => field.fieldType)).toEqual([
      'text', 'email', 'number', 'select', 'radio', 'checkbox', 'textarea', 'file', 'image',
    ]);
  });
});
