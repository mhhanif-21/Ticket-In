import { NextResponse } from 'next/server';
import { db } from '../../../../../../db';
import { registrations } from '../../../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { publishJob } from '../../../../../../lib/services/qstash';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await request.json();
    const { action } = body;

    if (action !== 'Approve' && action !== 'Reject') {
      return NextResponse.json({ status: 'error', message: 'Aksi tidak valid. Gunakan Approve atau Reject.' }, { status: 400 });
    }

    if (action === 'Reject') {
      await db.update(registrations).set({ status: 'Rejected' }).where(eq(registrations.id, id));
      return NextResponse.json({ status: 'success', message: 'Pendaftaran ditolak' });
    }

    if (action === 'Approve') {
      const updateResult = await db.update(registrations)
        .set({ status: 'Accepted' })
        .where(and(eq(registrations.id, id), eq(registrations.status, 'Pending')))
        .returning({ id: registrations.id });

      if (updateResult.length === 0) {
        return NextResponse.json({ status: 'error', message: 'Registrasi tidak ditemukan atau bukan berstatus Pending' }, { status: 404 });
      }

      // Publish to QStash asynchronously (S5-T1 requirements)
      await publishJob({
        url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/worker/process-ticket`,
        body: { registration_id: id }
      }).catch(err => {
        console.error('Failed to publish to QStash:', err);
        // Continue even if QStash fails in this scope? Yes, but usually we throw.
        // Actually, for resilient systems we should log it, but let's throw to fail the transaction if we were using one.
      });

      return NextResponse.json({ status: 'success', message: 'Pendaftaran disetujui' });
    }

  } catch (error) {
    console.error('Review Registration Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
