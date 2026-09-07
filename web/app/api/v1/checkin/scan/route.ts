import { NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations, checkInLogs, checkInSessions, events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

const INVALID_TICKET_MESSAGE = 'Ticket not registered in the system or registration not approved.';
const ALLOWED_SCAN_METHODS = new Set(['Camera', 'Manual']);

export async function POST(req: Request) {
  try {
    // 1. Get role, session, and event_id from middleware headers
    const role = req.headers.get('x-user-role');
    const sessionId = req.headers.get('x-session-id');
    const eventIdFromHeader = req.headers.get('x-event-id');
    const sessionVersionFromHeader = req.headers.get('x-session-version');

    if (role !== 'volunteer' || !sessionId || !eventIdFromHeader || !sessionVersionFromHeader) {
      return NextResponse.json(
        { status: 'error', message: 'Access denied: Only volunteers can scan' },
        { status: 403 }
      );
    }

    const body = await req.json();
    let ticket_code = body.ticket_code;
    const scan_method = body.scan_method ?? 'Camera';

    if (typeof scan_method !== 'string' || !ALLOWED_SCAN_METHODS.has(scan_method)) {
      return NextResponse.json(
        { status: 'error', message: 'scan_method must be Camera or Manual' },
        { status: 400 }
      );
    }

    if (body.event_id && body.event_id !== eventIdFromHeader) {
      return NextResponse.json(
        { status: 'error', message: 'Event on the ticket does not match volunteer access' },
        { status: 403 }
      );
    }

    const event_id = eventIdFromHeader;
    const sessionVersion = Number(sessionVersionFromHeader);

    if (typeof ticket_code !== 'string' || !event_id || !Number.isSafeInteger(sessionVersion)) {
      return NextResponse.json(
        { status: 'error', message: 'ticket_code and event_id are required' },
        { status: 400 }
      );
    }
    
    // Normalize input (S6-T3)
    ticket_code = ticket_code.trim().toUpperCase();

    // 2. Execute database transaction
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          id: checkInSessions.id,
          endedAt: checkInSessions.endedAt,
          sessionVersion: checkInSessions.sessionVersion,
          eventStatus: events.status,
          eventSessionVersion: events.volunteerSessionVersion,
        })
        .from(checkInSessions)
        .innerJoin(events, eq(checkInSessions.eventId, events.id))
        .where(and(
          eq(checkInSessions.id, sessionId),
          eq(checkInSessions.eventId, event_id),
        ))
        .for('update')
        .limit(1);

      if (
        !session
        || session.endedAt
        || session.eventStatus !== 'Published'
        || session.sessionVersion !== sessionVersion
        || session.eventSessionVersion !== sessionVersion
      ) {
        return NextResponse.json(
          { status: 'error', message: 'Check-in session is no longer active for this event.' },
          { status: 403 },
        );
      }

      // 2a. Find Registration based on ticket_code & event_id
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

      // 2b. Validation (TDS-008): If not exists or not Accepted
      if (!reg || reg.status !== 'Accepted') {
        // Record as Invalid. If ticket exists but wrong event, reg id can be inserted.
        await tx.insert(checkInLogs).values({
          checkInSessionId: sessionId,
          registrationId: reg?.id || null, // null if it does not exist in DB at all
          scannedTicketCode: ticket_code,
          scanMethod: scan_method,
          scanStatus: 'Invalid',
        });
        
        return NextResponse.json(
          { status: 'error', message: INVALID_TICKET_MESSAGE },
          { status: 404 }
        );
      }

      // 2c. Validation (TDS-003): Check if already scanned
      if (reg.presenceStatus === 'Present') {
        // Find when the ticket was first successfully scanned
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

        // Record this Duplicate event
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
            message: 'Ticket Already Used!', 
            data: {
              first_scanned_at: firstScannedAt,
              scanned_by_role: 'volunteer',
            }
          },
          { status: 409 }
        );
      }

      // 2d. Success Condition
      // Update registration status
      const attendanceTime = new Date();
      await tx
        .update(registrations)
        .set({ presenceStatus: 'Present', updatedAt: attendanceTime })
        .where(and(eq(registrations.id, reg.id), eq(registrations.presenceStatus, 'Absent')));

      // Record Success log
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
          message: 'Check-in Successful',
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
      { status: 'error', message: 'A server error occurred while processing the scan' },
      { status: 500 }
    );
  }
}
