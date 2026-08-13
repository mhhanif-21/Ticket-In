import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations, checkInLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

const INVALID_TICKET_MESSAGE = 'Tiket tidak terdaftar di sistem atau pendaftaran belum disetujui.';

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
    let ticket_code = body.ticket_code;
    const scan_method = body.scan_method ?? 'Camera';

    if (body.event_id && body.event_id !== eventIdFromHeader) {
      return NextResponse.json(
        { status: 'error', message: 'Event pada tiket tidak sesuai dengan akses panitia' },
        { status: 403 }
      );
    }

    const event_id = eventIdFromHeader;

    if (typeof ticket_code !== 'string' || !event_id) {
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
        .limit(1)
        .for('update');

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
          { status: 'error', message: INVALID_TICKET_MESSAGE },
          { status: 404 }
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

        const firstScannedAt = successLogs.length > 0 ? successLogs[0].createdAt : null;

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
            data: {
              first_scanned_at: firstScannedAt,
              scanned_by_role: 'volunteer',
            }
          },
          { status: 409 }
        );
      }

      // 2d. Kondisi Sukses
      // Update registration status
      const attendanceTime = new Date();
      await tx
        .update(registrations)
        .set({ presenceStatus: 'Present', updatedAt: attendanceTime })
        .where(and(eq(registrations.id, reg.id), eq(registrations.presenceStatus, 'Absent')));

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
            attendance_time: attendanceTime,
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
