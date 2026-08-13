import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing GenerateTicketAction
vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(),
    }
  }
}));

import { GenerateTicketAction } from '../../lib/actions/ticket';
import { db } from '../../db';
import { registrations, events } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '../../lib/supabase';
import * as ticketUtils from '../../lib/utils/ticketUtils';

describe('S5-T3 GenerateTicketAction', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  let pendingRegId: string;
  let acceptedRegId: string;
  let alreadyGeneratedRegId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create an event for foreign key constraints
    await db.insert(events).values({
      id: eventId,
      slug: 'test-event-s5-t3',
      name: 'Test Event S5 T3',
      description: 'Desc',
      location: 'Jakarta',
      date: new Date('2026-12-31'),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hashedpin123',
    }).onConflictDoNothing();

    // 1. Create a Pending registration
    const [pendingReg] = await db.insert(registrations).values({
      eventId: eventId,
      name: 'Pending User',
      email: 'pending@example.com',
      status: 'Pending',
    }).returning({ id: registrations.id });
    pendingRegId = pendingReg.id;

    // 2. Create an Accepted registration without ticket
    const [acceptedReg] = await db.insert(registrations).values({
      eventId: eventId,
      name: 'Accepted User',
      email: 'accepted@example.com',
      status: 'Accepted',
    }).returning({ id: registrations.id });
    acceptedRegId = acceptedReg.id;

    // 3. Create an Accepted registration with ticket already (Idempotency case)
    const [alreadyReg] = await db.insert(registrations).values({
      eventId: eventId,
      name: 'Already Generated',
      email: 'already@example.com',
      status: 'Accepted',
      ticketCode: 'ALRDY123',
      qrCodeUrl: 'https://example.com/qr.png',
    }).returning({ id: registrations.id });
    alreadyGeneratedRegId = alreadyReg.id;

    // Mock supabase upload and getPublicUrl
    vi.spyOn(supabaseAdmin.storage, 'from').mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://mock.supabase.co/storage/v1/object/public/tickets/mock.png' } }),
    } as any);

    // Mock QR generator to just return a dummy buffer instead of running sharp
    vi.spyOn(ticketUtils, 'generateQrCodeWithText').mockResolvedValue(Buffer.from('dummy image'));
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(registrations).where(eq(registrations.id, pendingRegId));
    await db.delete(registrations).where(eq(registrations.id, acceptedRegId));
    await db.delete(registrations).where(eq(registrations.id, alreadyGeneratedRegId));
  });

  it('should throw error if registration is not Accepted', async () => {
    await expect(GenerateTicketAction(pendingRegId)).rejects.toThrow('InvalidStateException');
  });

  it('should skip generation if ticket is already generated (TDS-002 Idempotency)', async () => {
    const uploadSpy = vi.spyOn(supabaseAdmin.storage, 'from');

    const result = await GenerateTicketAction(alreadyGeneratedRegId);
    expect(result.status).toBe('already_generated');
    expect(result.ticketCode).toBe('ALRDY123');

    // Make sure upload was never called
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('should generate ticket and update DB for Accepted registration', async () => {
    const result = await GenerateTicketAction(acceptedRegId);
    expect(result.status).toBe('success');
    expect(result.ticketCode).toHaveLength(8);
    expect(result.qrCodeUrl).toContain('mock.supabase.co');

    // Verify DB
    const dbCheck = await db.select().from(registrations).where(eq(registrations.id, acceptedRegId));
    expect(dbCheck[0].ticketCode).toBe(result.ticketCode);
    expect(dbCheck[0].qrCodeUrl).toBe(result.qrCodeUrl);
  });

  it('should throw error and NOT update DB if storage upload fails (TDS-009)', async () => {
    // Mock storage to fail
    vi.spyOn(supabaseAdmin.storage, 'from').mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Upload timeout') }),
      getPublicUrl: vi.fn(),
    } as any);

    await expect(GenerateTicketAction(acceptedRegId)).rejects.toThrow('Storage upload failed: Upload timeout');

    // Verify DB remains untouched
    const dbCheck = await db.select().from(registrations).where(eq(registrations.id, acceptedRegId));
    expect(dbCheck[0].ticketCode).toBeNull();
    expect(dbCheck[0].qrCodeUrl).toBeNull();
  });

  it('should retry on ticket_code collision', async () => {
    // We mock generateRandomTicketCode to first return 'ALRDY123' (which will cause a collision since we inserted it above)
    // and then 'NEWTICKE'
    const codeGenSpy = vi.spyOn(ticketUtils, 'generateRandomTicketCode')
      .mockReturnValueOnce('ALRDY123')
      .mockReturnValueOnce('NEWTICKE');

    const result = await GenerateTicketAction(acceptedRegId);
    expect(result.status).toBe('success');
    expect(result.ticketCode).toBe('NEWTICKE'); // It should have successfully moved on to the second code
    
    expect(codeGenSpy).toHaveBeenCalledTimes(2);

    const dbCheck = await db.select().from(registrations).where(eq(registrations.id, acceptedRegId));
    expect(dbCheck[0].ticketCode).toBe('NEWTICKE');
  });
});
