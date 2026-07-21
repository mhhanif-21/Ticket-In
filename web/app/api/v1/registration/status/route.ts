import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { registrations, events } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const email = searchParams.get('email');

    if (!name || !email) {
      return NextResponse.json({ status: 'error', message: 'Parameter name dan email wajib diisi' }, { status: 400 });
    }

    const regRecords = await db
      .select({
        id: registrations.id,
        status: registrations.status,
        ticketCode: registrations.ticketCode,
        qrCodeUrl: registrations.qrCodeUrl,
        eventId: registrations.eventId,
        name: registrations.name,
        email: registrations.email
      })
      .from(registrations)
      .where(and(eq(registrations.name, name), eq(registrations.email, email)))
      .limit(1);

    if (regRecords.length === 0) {
      // TDS-010: Return 404 without leaking info
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    const reg = regRecords[0];

    return NextResponse.json({
      status: 'success',
      message: 'Tiket berhasil ditemukan',
      data: {
        id: reg.id,
        status: reg.status,
        ticket_code: reg.ticketCode,
        qr_code_url: reg.qrCodeUrl,
        name: reg.name,
        email: reg.email
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error in check status API:', error);
    return NextResponse.json({ status: 'error', message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
