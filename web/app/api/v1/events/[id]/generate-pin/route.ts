import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { isPublicEventStatus } from '@/lib/events/eventLifecycle';
import { revokeVolunteerSessionsTx } from '@/lib/events/eventLifecycleActions';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    
    // Generate 6-digit random PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash PIN
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(pin, salt);

    const rotated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(events).where(eq(events.id, id)).for('update').limit(1);
      if (!existing) return 'not_found' as const;
      if (!isPublicEventStatus(existing.status)) return 'inactive' as const;

      const updatedAt = new Date();
      await tx.update(events)
        .set({
          volunteerPinHash: pinHash,
          volunteerSessionVersion: existing.volunteerSessionVersion + 1,
          updatedAt,
        })
        .where(eq(events.id, id));
      await revokeVolunteerSessionsTx(tx, id, updatedAt);
      return 'rotated' as const;
    });

    if (rotated === 'not_found') {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }
    if (rotated === 'inactive') {
      return NextResponse.json({ status: 'error', message: 'PIN tidak dapat dibuat untuk event yang belum dipublikasikan atau dibatalkan.' }, { status: 409 });
    }

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
