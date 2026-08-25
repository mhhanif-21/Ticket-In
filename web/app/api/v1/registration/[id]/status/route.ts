import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTicketGenerationJob } from '@/lib/actions/ticketGenerationJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      // Ticket generation is owned by the durable QStash worker. A polling
      // request must only observe job state; fire-and-forget work here can be
      // terminated by Vercel and leaves the participant loading forever.
      const job = await getTicketGenerationJob(id);
      if (job?.status === 'failed') {
        return NextResponse.json({
          status: 'failed',
          message: 'Penerbitan tiket gagal dan perlu diulang oleh admin.',
          job_status: job.status,
          qr_code_url: null,
        }, { status: 200 });
      }

      return NextResponse.json({
        status: 'processing',
        message: reg.status === 'Accepted'
          ? 'Tiket sedang diproses oleh worker.'
          : 'Registrasi belum diterima.',
        job_status: job?.status || null,
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
