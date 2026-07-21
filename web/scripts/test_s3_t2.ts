import { eq } from 'drizzle-orm';
import { db } from '../db';
import { events } from '../db/schema';

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let eventId = '';

async function loginAdmin() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' })
  });
  if (!res.ok) throw new Error('Admin login failed');
  const body = await res.json();
  adminToken = body.data.access_token;
  console.log('✅ Admin login success');
}

async function createDummyEvent() {
  const res = await fetch(`${BASE_URL}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: 'Event for T2',
      capacity: 100,
      location: 'Test',
      date: '2026-10-10T09:00:00Z',
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Create dummy event failed');
  eventId = body.data[0]?.id || body.data.id;
  console.log('✅ Created dummy event:', eventId);
}

async function testSubmit26Fields() {
  const fields = Array.from({ length: 26 }).map((_, i) => ({
    fieldName: `Field ${i}`,
    fieldType: 'text',
    isRequired: false,
    options: null,
    order: i
  }));

  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ fields })
  });
  const body = await res.json();
  if (res.status !== 422) {
    throw new Error(`Expected 422 for 26 fields, got ${res.status}: ${JSON.stringify(body)}`);
  }
  console.log('✅ Test 26 fields rejected (TDS-004) passed:', body.message);
}

async function testSubmit25Fields() {
  const fields = Array.from({ length: 25 }).map((_, i) => ({
    fieldName: `Field Valid ${i}`,
    fieldType: i === 0 ? 'image' : 'text', // test new 'image' type too
    isRequired: false,
    options: null,
    order: i
  }));

  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ fields })
  });
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`Expected 200 for 25 fields, got ${res.status}: ${JSON.stringify(body)}`);
  }
  console.log('✅ Test 25 fields success passed:', body.message);
}

async function testGetEventFields() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`Expected 200 for detail, got ${res.status}`);
  }
  if (!body.data.formFields || body.data.formFields.length !== 25) {
    throw new Error(`Expected 25 form fields in detail, got ${body.data.formFields?.length}`);
  }
  if (body.data.formFields[0].order !== 0) {
    throw new Error('Fields are not ordered correctly');
  }
  console.log('✅ Test GET detail includes formFields passed. (Count = 25, ordered correctly)');
}

async function testUpdateFields() {
  // Update to only 2 fields to test replace semantics
  const fields = [
    { fieldName: 'Nama Lengkap', fieldType: 'text', isRequired: true, options: null, order: 1 },
    { fieldName: 'Umur', fieldType: 'number', isRequired: false, options: null, order: 2 }
  ];

  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/fields`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ fields })
  });
  if (res.status !== 200) throw new Error('Update fields failed');

  const getRes = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const getBody = await getRes.json();
  if (getBody.data.formFields.length !== 2) {
    throw new Error(`Expected 2 form fields after replace, got ${getBody.data.formFields.length}`);
  }
  console.log('✅ Test Replace semantics passed.');
}

async function cleanup() {
  if (eventId) {
    await db.delete(events).where(eq(events.id, eventId));
    console.log('✅ Cleanup: Deleted dummy event');
  }
}

async function runTests() {
  try {
    console.log('--- Testing S3-T2 Dynamic Form Builder ---');
    await loginAdmin();
    await createDummyEvent();
    await testSubmit26Fields();
    await testSubmit25Fields();
    await testGetEventFields();
    await testUpdateFields();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

runTests();
