import { db } from '../../db';
import { registrations } from '../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * GenerateTicketAction (Stub for S5-T3)
 * Handles idempotent ticket generation.
 */
export async function GenerateTicketAction(registrationId: string) {
  // 1. Fetch registration
  const result = await db.select().from(registrations).where(eq(registrations.id, registrationId));
  if (result.length === 0) {
    throw new Error('Registration not found');
  }

  const registration = result[0];

  // 2. Idempotency Check: Jika tiket sudah digenerate (ticket_code tidak null), lewati
  if (registration.ticketCode) {
    console.log(`Ticket already generated for registration ${registrationId}. Skipping.`);
    return { status: 'already_generated', ticketCode: registration.ticketCode };
  }

  // S5-T3 Placeholder: Generate Ticket Logic
  // - Bikin kode unik
  // - Generate QR code buffer
  // - Upload QR code ke S3 / Supabase Storage
  // - Update DB dengan ticket_code & qr_code_url
  // - Call S5-T4: Kirim email

  return { status: 'success', message: 'Placeholder: Ticket generation triggered' };
}
