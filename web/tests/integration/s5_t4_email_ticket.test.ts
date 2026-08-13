import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing GenerateTicketAction
vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(),
    }
  }
}));

import { triggerTicketEmailDelivery } from '../../lib/actions/ticket';
import { db } from '../../db';
import { registrations, events } from '../../db/schema';
import { eq } from 'drizzle-orm';

describe('S5-T4 Email Ticket Delivery', () => {
  let manualReviewEventId = '22222222-2222-2222-2222-222222222222';
  let autoAcceptEventId = '33333333-3333-3333-3333-333333333333';
  let manualRegId: string;
  let autoRegId: string;
  let originalFetch = global.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create 'Manual Review' event
    await db.insert(events).values({
      id: manualReviewEventId,
      slug: 'manual-test-s5-t4',
      name: 'Manual Test Event',
      location: 'Jakarta',
      date: new Date('2026-12-31'),
      capacity: 100,
      registrationMode: 'Manual Review',
      volunteerPinHash: 'hashedpin',
      status: 'Published'
    }).onConflictDoNothing();

    // Create 'Auto-Accept' event
    await db.insert(events).values({
      id: autoAcceptEventId,
      slug: 'auto-test-s5-t4',
      name: 'Auto Test Event',
      location: 'Bandung',
      date: new Date('2026-12-31'),
      capacity: 100,
      registrationMode: 'Auto-Accept',
      volunteerPinHash: 'hashedpin',
      status: 'Published'
    }).onConflictDoNothing();

    // Create Registration for Manual Review
    const [manualReg] = await db.insert(registrations).values({
      eventId: manualReviewEventId,
      name: 'Manual User',
      email: 'manual@example.com',
      status: 'Accepted',
      ticketCode: 'MNL12345',
      qrCodeUrl: 'https://mock.qr/1.png'
    }).returning({ id: registrations.id });
    manualRegId = manualReg.id;

    // Create Registration for Auto-Accept
    const [autoReg] = await db.insert(registrations).values({
      eventId: autoAcceptEventId,
      name: 'Auto User',
      email: 'auto@example.com',
      status: 'Accepted',
      ticketCode: 'AUTO1234',
      qrCodeUrl: 'https://mock.qr/2.png'
    }).returning({ id: registrations.id });
    autoRegId = autoReg.id;
    
    global.fetch = vi.fn();
    process.env.BREVO_API_KEY = 'test-brevo-key';
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await db.delete(registrations).where(eq(registrations.id, manualRegId));
    await db.delete(registrations).where(eq(registrations.id, autoRegId));
    await db.delete(events).where(eq(events.id, manualReviewEventId));
    await db.delete(events).where(eq(events.id, autoAcceptEventId));
  });

  it('should skip email delivery if event is Auto-Accept', async () => {
    await triggerTicketEmailDelivery(autoRegId);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should send email if event is Manual Review', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messageId: '123' }),
    } as Response);

    await triggerTicketEmailDelivery(manualRegId);
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchArgs = vi.mocked(global.fetch).mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.brevo.com/v3/smtp/email');
    const options = fetchArgs[1] as RequestInit;
    expect(options.method).toBe('POST');
    
    const body = JSON.parse(options.body as string);
    expect(body.to[0].email).toBe('manual@example.com');
    expect(body.subject).toContain('Manual Test Event');
    expect(body.htmlContent).toContain('MNL12345');
    expect(body.htmlContent).toContain('https://mock.qr/1.png');
  });

  it('should enforce 3-second timeout and throw error (EHR-002)', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      // Simulate delay > 3 seconds
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve({ ok: true } as Response);
        }, 5000);
        
        // Listen to AbortSignal to reject early
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    await expect(triggerTicketEmailDelivery(manualRegId)).rejects.toThrow('Brevo email sending timed out after 3000ms');
  });

  it('should throw error if Brevo API returns non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(triggerTicketEmailDelivery(manualRegId)).rejects.toThrow('Brevo API error: 401 Unauthorized');
  });
});
