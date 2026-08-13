import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const id = params.id;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    const regRecords = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, id))
      .limit(1);

    if (regRecords.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    const reg = regRecords[0];

    if (!reg.ticketCode || !reg.qrCodeUrl) {
      // Self-healing: if status is Accepted but no ticket, trigger it directly.
      // We don't use QStash here because QStash cannot reach localhost in dev mode.
      if (reg.status === 'Accepted') {
        try {
          const { GenerateTicketAction } = await import('@/lib/actions/ticket');
          // Start it in background to not block the polling response, though Vercel might kill it.
          // For local testing, it will run fine.
          GenerateTicketAction(id).catch(console.error);
        } catch (err) {
          console.error('Failed to self-heal ticket generation:', err);
        }
      }

      return NextResponse.json({
        status: 'processing',
        message: 'Sedang diproses...',
        qr_code_url: null
      }, { status: 200 });
    }

    return NextResponse.json({
      status: 'completed',
      message: 'Tiket berhasil diterbitkan',
      qr_code_url: reg.qrCodeUrl,
      ticket_code: reg.ticketCode
    }, { status: 200 });

  } catch (error) {
    console.error('Error in polling API:', error);
    return NextResponse.json({ status: 'error', message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
