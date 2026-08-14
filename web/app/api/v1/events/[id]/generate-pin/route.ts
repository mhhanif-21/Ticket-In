import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    
    // Check if event exists
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    // Generate 6-digit random PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash PIN
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(pin, salt);

    // Update in DB
    await db.update(events)
      .set({ volunteerPinHash: pinHash, updatedAt: new Date() })
      .where(eq(events.id, id));

    return NextResponse.json({ 
      status: 'success', 
      message: 'PIN berhasil dibuat',
      data: {
        pin: pin
      }
    });

  } catch (error: any) {
    console.error('Error generating PIN:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
