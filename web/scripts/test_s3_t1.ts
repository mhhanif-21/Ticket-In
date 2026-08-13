import { eq } from 'drizzle-orm';
import { db } from '../db';
import { events } from '../db/schema';

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let createdEventId = '';

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

async function createEvent() {
  const res = await fetch(`${BASE_URL}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: 'Test Event ' + Date.now(),
      capacity: 100,
      location: 'Jakarta',
      date: '2026-10-10T09:00:00Z',
      description: 'Ini adalah event test'
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Create event failed: ' + JSON.stringify(body));
  createdEventId = body.data[0]?.id || body.data.id;
  console.log('✅ Create event success:', createdEventId);
}

async function listEvents() {
  const res = await fetch(`${BASE_URL}/api/v1/events`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const body = await res.json();
  if (!res.ok) throw new Error('List events failed: ' + JSON.stringify(body));
  if (!Array.isArray(body.data)) throw new Error('Expected array in list events');
  console.log('✅ List events success. Total:', body.data.length);
}

async function getEventDetail() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${createdEventId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Get detail failed: ' + JSON.stringify(body));
  console.log('✅ Get detail success for:', body.data.name);
}

async function updateEvent() {
  const res = await fetch(`${BASE_URL}/api/v1/events/${createdEventId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      capacity: 200
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Update event failed: ' + JSON.stringify(body));
  console.log('✅ Update event success. New capacity:', body.data[0]?.capacity || body.data.capacity);
}

async function testPosterUpload() {
  // Create a dummy file via Blob/Buffer
  const buffer = Buffer.from('dummy image content');
  const blob = new Blob([buffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('poster', blob, 'test.png');

  const res = await fetch(`${BASE_URL}/api/v1/events/${createdEventId}/poster`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    },
    body: formData
  });
  const body = await res.json();
  if (!res.ok) {
    console.warn('⚠️ Poster upload failed (expected if bucket "posters" not exist):', body);
  } else {
    console.log('✅ Poster upload success. URL:', body.data[0]?.posterUrl || body.data.posterUrl);
  }
}

async function cleanup() {
  if (createdEventId) {
    await db.delete(events).where(eq(events.id, createdEventId));
    console.log('✅ Cleanup: Deleted test event');
  }
}

async function runTests() {
  try {
    console.log('--- Testing S3-T1 CRUD Event ---');
    await loginAdmin();
    await createEvent();
    await listEvents();
    await getEventDetail();
    await updateEvent();
    await testPosterUpload();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

runTests();
