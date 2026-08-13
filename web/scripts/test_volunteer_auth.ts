import { db } from '../db/index.js';
import { events } from '../db/schema.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

async function runTest() {
  console.log('--- Testing Volunteer PIN Auth (S2-T2) ---');

  const testEventSlug = 'test-event-volunteer-auth';
  const pin = '123456';
  
  // 1. Setup Data: Buat Event Dummy
  console.log('\n[1] Setting up dummy event...');
  const hashedPin = await bcrypt.hash(pin, 10);
  
  // Hapus dulu kalau ada
  await db.delete(events).where(eq(events.slug, testEventSlug));
  
  const [newEvent] = await db.insert(events).values({
    name: 'Test Volunteer Event',
    slug: testEventSlug,
    location: 'Jakarta',
    date: new Date(),
    capacity: 100,
    registrationMode: 'Auto-Accept',
    volunteerPinHash: hashedPin,
  }).returning();
  console.log(`Event created: ${newEvent.slug}`);

  // 2. Test Login (Valid)
  console.log('\n[2] Testing POST /api/v1/auth/volunteer/login (Valid PIN)...');
  const resValid = await fetch('http://localhost:3000/api/v1/auth/volunteer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
    body: JSON.stringify({ event_slug: testEventSlug, pin: '123456', volunteer_name: 'Budi' })
  });
  const dataValid = await resValid.json();
  let token = '';
  if (dataValid.status === 'success') {
    token = dataValid.data.access_token;
    console.log('✅ Access token received:', token.substring(0, 20) + '...');
  } else {
    console.error('❌ Login failed:', dataValid);
  }

  // 3. Test RBAC Middleware (Volunteer access Admin route)
  console.log('\n[3] Testing Middleware: Volunteer accessing Admin Route (GET /api/v1/events)...');
  const resAdminRoute = await fetch('http://localhost:3000/api/v1/events', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Status: ${resAdminRoute.status} (Expect 403)`);
  if (resAdminRoute.status === 403) console.log('✅ Correctly blocked Volunteer from Admin route.');

  // 4. Test Rate Limit (6x Failed)
  console.log('\n[4] Testing Rate Limiting (6 failed logins)...');
  for (let i = 1; i <= 6; i++) {
    const resInvalid = await fetch('http://localhost:3000/api/v1/auth/volunteer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      body: JSON.stringify({ event_slug: testEventSlug, pin: 'wrong', volunteer_name: 'Budi' })
    });
    
    if (i <= 5) {
      if (resInvalid.status === 401) {
        console.log(`Attempt ${i}: Blocked as 401 (Wrong PIN) ✅`);
      } else {
        console.log(`Attempt ${i}: Unexpected status ${resInvalid.status} ❌`);
      }
    } else {
      if (resInvalid.status === 429) {
        console.log(`Attempt ${i}: Rate limited (429) ✅`);
      } else {
        console.log(`Attempt ${i}: Unexpected status ${resInvalid.status} ❌`);
      }
    }
  }

  // Cleanup
  console.log('\n[5] Cleaning up dummy event...');
  await db.delete(events).where(eq(events.slug, testEventSlug));
  console.log('--- Test Finished ---');
  process.exit(0);
}

runTest().catch(console.error);
