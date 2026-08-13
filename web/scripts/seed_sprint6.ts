import { db } from '../db';
import { events, registrations } from '../db/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Menyiapkan data demo Sprint 6...');
  
  // 1. Buat Event Demo
  const pin = '123456';
  const hashedPin = await bcrypt.hash(pin, 10);
  const slug = 'sprint-6-demo';
  
  const [event] = await db.insert(events).values({
    name: 'Konser Amal Sprint 6',
    slug: slug,
    description: 'Event khusus untuk demo scanner UI',
    location: 'Stadion Utama',
    date: new Date(Date.now() + 86400000), // Besok
    capacity: 100,
    registrationMode: 'Auto-Accept',
    volunteerPinHash: hashedPin,
  }).onConflictDoUpdate({
    target: events.slug,
    set: { volunteerPinHash: hashedPin }
  }).returning();

  console.log(`✅ Event dibuat: ${event.name} (Slug: ${event.slug})`);
  console.log(`🔑 PIN Panitia: ${pin}`);

  // 2. Buat Tiket Valid
  const ticketCode1 = 'DEMO1234';
  const [reg1] = await db.insert(registrations).values({
    eventId: event.id,
    name: 'Budi (Peserta Valid)',
    email: 'budi@demo.com',
    status: 'Accepted',
    ticketCode: ticketCode1,
    presenceStatus: 'Absent'
  }).onConflictDoNothing().returning();

  // 3. Buat Tiket Pending (Tidak Sah)
  const ticketCode2 = 'PEND9999';
  const [reg2] = await db.insert(registrations).values({
    eventId: event.id,
    name: 'Andi (Peserta Pending)',
    email: 'andi@demo.com',
    status: 'Pending',
    ticketCode: ticketCode2,
    presenceStatus: 'Absent'
  }).onConflictDoNothing().returning();

  console.log(`\n🎟️ Tiket Uji Coba:`);
  console.log(`1. Tiket Valid & Sukses   : ${ticketCode1}`);
  console.log(`2. Tiket Belum Dibayar/Pending: ${ticketCode2}`);

  console.log(`\n🚀 Siap! Jalankan server dan buka:`);
  console.log(`http://localhost:3000/${slug}/checkin`);
  process.exit(0);
}

seed().catch(console.error);
