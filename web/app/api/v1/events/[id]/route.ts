import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin' && role !== 'volunteer') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const event = await db.query.events.findFirst({
      where: eq(events.id, id),
      with: {
        formFields: {
          orderBy: (fields, { asc }) => [asc(fields.order)],
        }
      }
    });

    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const publicUrl = `${baseUrl}/r/${event.slug}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

    const eventWithUrls = {
      ...event,
      public_registration_url: publicUrl,
      public_qr_code_url: qrUrl
    };

    return NextResponse.json({ status: 'success', data: eventWithUrls });
  } catch (error: any) {
    console.error('Error fetching event details:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.capacity !== undefined) updateData.capacity = parseInt(body.capacity, 10);
    if (body.registration_mode !== undefined) {
      if (body.registration_mode !== 'Auto-Accept' && body.registration_mode !== 'Manual Review') {
        return NextResponse.json({ status: 'error', message: 'Registration mode tidak valid' }, { status: 400 });
      }
      updateData.registrationMode = body.registration_mode;
    }
    
    updateData.updatedAt = new Date();

    const [updatedEvent] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();

    return NextResponse.json({ status: 'success', message: 'Event berhasil diperbarui', data: updatedEvent });
  } catch (error: any) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
