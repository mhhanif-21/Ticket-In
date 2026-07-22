import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations, checkInLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // 1. Dapatkan role, session, dan event_id dari middleware headers
    const role = req.headers.get('x-user-role');
    const sessionId = req.headers.get('x-session-id');
    const eventIdFromHeader = req.headers.get('x-event-id');

    if (role !== 'volunteer' || !sessionId || !eventIdFromHeader) {
      return NextResponse.json(
        { status: 'error', message: 'Akses ditolak: Hanya panitia yang dapat melakukan scan' },
        { status: 403 }
      );
    }

    const body = await req.json();
    let { ticket_code, scan_method = 'Camera' } = body;
    const event_id = body.event_id || eventIdFromHeader;

    if (!ticket_code || !event_id) {
      return NextResponse.json(
        { status: 'error', message: 'ticket_code dan event_id wajib diisi' },
        { status: 400 }
      );
    }
    
    // Normalisasi input (S6-T3)
    ticket_code = ticket_code.trim().toUpperCase();

    // 2. Lakukan transaksi database
    return await db.transaction(async (tx) => {
      // 2a. Cari Registrasi berdasarkan ticket_code & event_id
      const regRecords = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.ticketCode, ticket_code),
            eq(registrations.eventId, event_id)
          )
        )
        .limit(1);

      const reg = regRecords[0];

      // 2b. Validasi (TDS-008): Jika tidak ada atau bukan Accepted
      if (!reg || reg.status !== 'Accepted') {
        // Catat sebagai Invalid. Jika tiket ada tapi salah acara, id reg bisa disisipkan.
        await tx.insert(checkInLogs).values({
          checkInSessionId: sessionId,
          registrationId: reg?.id || null, // null jika sama sekali tidak ada di DB
          scannedTicketCode: ticket_code,
          scanMethod: scan_method,
          scanStatus: 'Invalid',
        });
        
        return NextResponse.json(
          { status: 'error', message: 'Tiket Tidak Sah' },
          { status: 400 }
        );
      }

      // 2c. Validasi (TDS-003): Cek apakah sudah pernah di-scan
      if (reg.presenceStatus === 'Present') {
        // Cari kapan tiket pertama kali sukses di-scan
        const successLogs = await tx
          .select({ createdAt: checkInLogs.createdAt })
          .from(checkInLogs)
          .where(
            and(
              eq(checkInLogs.registrationId, reg.id),
              eq(checkInLogs.scanStatus, 'Success')
            )
          )
          .orderBy(checkInLogs.createdAt)
          .limit(1);

        const firstScanTime = successLogs.length > 0 ? successLogs[0].createdAt : null;

        // Catat kejadian Duplicate ini
        await tx.insert(checkInLogs).values({
          checkInSessionId: sessionId,
          registrationId: reg.id,
          scannedTicketCode: ticket_code,
          scanMethod: scan_method,
          scanStatus: 'Duplicate',
        });

        return NextResponse.json(
          { 
            status: 'error', 
            message: 'Tiket Sudah Digunakan!', 
            data: { first_scan_time: firstScanTime } 
          },
          { status: 409 }
        );
      }

      // 2d. Kondisi Sukses
      // Update registration status
      await tx
        .update(registrations)
        .set({ presenceStatus: 'Present', updatedAt: new Date() })
        .where(eq(registrations.id, reg.id));

      // Catat log Success
      await tx.insert(checkInLogs).values({
        checkInSessionId: sessionId,
        registrationId: reg.id,
        scannedTicketCode: ticket_code,
        scanMethod: scan_method,
        scanStatus: 'Success',
      });

      return NextResponse.json(
        { 
          status: 'success', 
          message: 'Check-in Berhasil',
          data: {
            participant_name: reg.name,
            ticket_code: reg.ticketCode,
          }
        },
        { status: 200 }
      );
    });

  } catch (error: any) {
    console.error('Scan Ticket Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memproses scan' },
      { status: 500 }
    );
  }
}
