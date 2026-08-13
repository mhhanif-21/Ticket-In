import { eq } from 'drizzle-orm';
import { db } from '../db';
import { events } from '../db/schema';

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let eventId = '';
let eventSlug = '';

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
      name: 'Event PIN Test',
      capacity: 50,
      location: 'Test Location',
      date: '2026-12-12T09:00:00Z',
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Create dummy event failed');
  eventId = body.data[0]?.id || body.data.id;
  eventSlug = body.data[0]?.slug || body.data.slug;
  console.log('✅ Created dummy event:', eventId);
}

async function testGenerateAndLogin() {
  // 1. Generate PIN
  let res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/generate-pin`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  let body = await res.json();
  if (res.status !== 200) throw new Error(`Generate PIN failed: ${res.status}`);
  
  const firstPin = body.data.pin;
  if (!firstPin || firstPin.length !== 6) throw new Error('PIN invalid format');
  console.log('✅ Generated first PIN:', firstPin);

  // 2. Test Volunteer Login with first PIN
  res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_slug: eventSlug,
      pin: firstPin,
      volunteer_name: 'Test Volunteer'
    })
  });
  if (res.status !== 200) throw new Error('Login with first PIN failed');
  console.log('✅ Volunteer login with first PIN success');

  // 3. Generate new PIN (Rotasi)
  res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/generate-pin`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  body = await res.json();
  const secondPin = body.data.pin;
  console.log('✅ Generated second PIN:', secondPin);

  // 4. Test Volunteer Login with old PIN (should fail)
  res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_slug: eventSlug,
      pin: firstPin,
      volunteer_name: 'Test Volunteer'
    })
  });
  if (res.status === 200) throw new Error('Old PIN is still valid! Rotation failed');
  console.log('✅ Login with old PIN rejected correctly');

  // 5. Test Volunteer Login with new PIN (should succeed)
  res = await fetch(`${BASE_URL}/api/v1/auth/volunteer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_slug: eventSlug,
      pin: secondPin,
      volunteer_name: 'Test Volunteer'
    })
  });
  if (res.status !== 200) throw new Error('Login with new PIN failed');
  console.log('✅ Login with new PIN success');
}

async function testPublicUrls() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const body = await res.json();
  
  if (!body.data.public_registration_url || !body.data.public_qr_code_url) {
    throw new Error('Public URLs are missing from event details');
  }
  
  if (!body.data.public_registration_url.includes(eventSlug)) {
    throw new Error('Public registration URL does not include slug');
  }

  console.log('✅ Public URLs exist and contain slug');
}

async function cleanup() {
  if (eventId) {
    await db.delete(events).where(eq(events.id, eventId));
    console.log('✅ Cleanup: Deleted dummy event');
  }
}

async function runTests() {
  try {
    console.log('--- Testing S3-T4 Volunteer Access ---');
    await loginAdmin();
    await createDummyEvent();
    await testGenerateAndLogin();
    await testPublicUrls();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

runTests();
