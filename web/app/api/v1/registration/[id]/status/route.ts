import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { registrations } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

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
