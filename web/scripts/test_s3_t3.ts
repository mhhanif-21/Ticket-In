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
      name: 'Event for T3',
      capacity: 100,
      location: 'Test',
      date: '2026-10-10T09:00:00Z',
      registration_mode: 'Auto-Accept'
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Create dummy event failed');
  eventId = body.data[0]?.id || body.data.id;
  console.log('✅ Created dummy event with Auto-Accept:', eventId);
}

async function testInvalidMode() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ registration_mode: 'RandomMode' })
  });
  const body = await res.json();
  if (res.status !== 400) {
    throw new Error(`Expected 400 for invalid mode, got ${res.status}`);
  }
  console.log('✅ Test invalid mode rejected passed');
}

async function testValidModeUpdate() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ registration_mode: 'Manual Review' })
  });
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`Expected 200 for valid mode update, got ${res.status}`);
  }

  // Verify in GET
  const getRes = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const getBody = await getRes.json();
  if (getBody.data.registrationMode !== 'Manual Review') {
    throw new Error('Mode not updated correctly in DB');
  }
  console.log('✅ Test valid mode update passed');
}

async function cleanup() {
  if (eventId) {
    await db.delete(events).where(eq(events.id, eventId));
    console.log('✅ Cleanup: Deleted dummy event');
  }
}

async function runTests() {
  try {
    console.log('--- Testing S3-T3 Registration Mode Toggle ---');
    await loginAdmin();
    await createDummyEvent();
    await testInvalidMode();
    await testValidModeUpdate();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

runTests();
