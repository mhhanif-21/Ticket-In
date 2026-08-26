import { db } from '../../db';
import { registrations } from '../../db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { generateRandomTicketCode, generateQrCodeWithText } from '../utils/ticketUtils';
import { supabaseAdmin } from '../supabase';
import { STORAGE_BUCKETS } from '../storage/buckets';
import {
  getActiveApprovalEmailTemplate,
  getTicketTemplateConfig,
  renderApprovalEmailTemplate,
} from '../tickets/ticketTemplate';

import { getConfiguredBrevoSender, sendEmail } from '../services/brevo';
import { events } from '../../db/schema';
import { isPublicEventStatus } from '../events/eventLifecycle';
import {
  claimTicketGenerationJob,
  getTicketGenerationJob,
  markTicketGenerationJobCompleted,
  markTicketGenerationJobCancelled,
  markTicketGenerationJobFailed,
} from './ticketGenerationJob';

// Mengambil binary QR dari bucket tiket milik aplikasi untuk attachment Brevo yang aman.
async function getTicketQrAttachment(qrCodeUrl: string, ticketCode: string) {
  const storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageBaseUrl) throw new Error('Ticket storage URL is not configured');

  const expectedOrigin = new URL(storageBaseUrl).origin;
  const ticketUrl = new URL(qrCodeUrl);
  if (
    ticketUrl.origin !== expectedOrigin ||
    !ticketUrl.pathname.startsWith('/storage/v1/object/public/tickets/')
  ) {
    throw new Error('Ticket QR URL is outside the trusted storage bucket');
  }

  const response = await fetch(ticketUrl);
  if (!response.ok) throw new Error('Ticket QR attachment could not be downloaded');

  const content = Buffer.from(await response.arrayBuffer()).toString('base64');
  return { content, name: `ticket-${ticketCode}.png` };
}

// Menghapus object yang baru diunggah hanya jika belum pernah berhasil direferensikan database.
async function cleanupUnclaimedTicketObject(fileName: string): Promise<void> {
  try {
    const bucket = supabaseAdmin.storage.from(STORAGE_BUCKETS.tickets);
    if (typeof bucket.remove === 'function') await bucket.remove([fileName]);
  } catch {
    // Cleanup terbaik tidak boleh menutupi error generation utama; job gagal tetap dapat diretry.
  }
}

// Helper stub for S5-T4
export async function triggerTicketEmailDelivery(registrationId: string) {
  // Fetch registration with event
  const result = await db.select({
    registration: registrations,
    event: events,
  })
  .from(registrations)
  .innerJoin(events, eq(registrations.eventId, events.id))
  .where(eq(registrations.id, registrationId));

  if (result.length === 0) return;
  const { registration, event } = result[0];

  // Only send if registration_mode == 'Manual Review'
  if (event.registrationMode !== 'Manual Review') {
    console.log(`Skipping email delivery: Event mode is ${event.registrationMode}`);
    return;
  }

  // Ensure ticket exists
  if (!registration.ticketCode || !registration.qrCodeUrl) {
    throw new Error('Ticket not fully generated');
  }

  const approvalTemplate = await getActiveApprovalEmailTemplate(event.id);
  const renderedEmail = approvalTemplate
    ? renderApprovalEmailTemplate(approvalTemplate, {
      name: registration.name,
      email: registration.email,
      eventName: event.name,
      ticketCode: registration.ticketCode,
      ticketImageUrl: registration.qrCodeUrl,
      answers: registration.answers,
      answerFieldLabels: registration.answerFieldLabels,
    })
    : {
      subject: `Your Ticket for ${event.name}`,
      htmlContent: `
        <h1>Hello ${registration.name},</h1>
        <p>Your ticket for <strong>${event.name}</strong> is ready!</p>
        <p>Ticket Code: <strong>${registration.ticketCode}</strong></p>
        <p>Please show the QR code below at the entrance:</p>
        <img src="${registration.qrCodeUrl}" alt="QR Code" />
      `,
    };

  // Brevo wrapper already enforces the 3-second hard timeout
  const attachment = await getTicketQrAttachment(registration.qrCodeUrl, registration.ticketCode);
  await sendEmail({
    to: [{ email: registration.email, name: registration.name }],
    subject: renderedEmail.subject,
    htmlContent: renderedEmail.htmlContent,
    sender: getConfiguredBrevoSender(),
    attachment: [attachment],
  });
  console.log(`Ticket email sent to ${registration.email}`);
}

/**
 * GenerateTicketAction (S5-T3)
 * Handles idempotent ticket generation, QR rendering, storage upload, and DB commit.
 */
export async function GenerateTicketAction(registrationId: string) {
  // 1. Fetch registration
  const result = await db.select({
    registration: registrations,
    event: events,
  })
  .from(registrations)
  .innerJoin(events, eq(registrations.eventId, events.id))
  .where(eq(registrations.id, registrationId));

  if (result.length === 0) {
    throw new Error('Registration not found');
  }

  const { registration, event } = result[0];

  if (!isPublicEventStatus(event.status)) {
    await markTicketGenerationJobCancelled(registrationId, 'Event is not published. Ticket issuance was cancelled.');
    return { status: 'cancelled', ticketCode: null, qrCodeUrl: null };
  }

  // 2. Validate status (BIZ-003)
  if (registration.status !== 'Accepted') {
    throw new Error('InvalidStateException: Ticket can only be generated for Accepted registrations');
  }

  // 3. Idempotency Check: Jika tiket sudah digenerate, lewati
  if (registration.ticketCode && registration.qrCodeUrl) {
    console.log(`Ticket already generated for registration ${registrationId}. Skipping generation.`);
    const existingJob = await getTicketGenerationJob(registrationId);
    if (existingJob?.status === 'completed') {
      return { status: 'already_generated', ticketCode: registration.ticketCode };
    }
    // Reuse the existing QR on delivery retry and close the durable job only
    // after the email provider accepts the message.
    await triggerTicketEmailDelivery(registrationId);
    await markTicketGenerationJobCompleted(registrationId);
    return { status: 'already_generated', ticketCode: registration.ticketCode };
  }

  const ticketJobClaim = await claimTicketGenerationJob(registrationId);
  if (!ticketJobClaim.claimed) {
    return { status: 'in_progress', ticketCode: null, qrCodeUrl: null };
  }

  const ticketTemplate = await getTicketTemplateConfig(event.id);

  const maxRetries = 3;
  let attempt = 0;
  let finalTicketCode = '';
  let finalQrCodeUrl = '';
  let uploadedFileName: string | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      // 4. Generate 8-character code
      const ticketCode = generateRandomTicketCode();

      // 5. Render QR Code (FR-REG-11)
      const qrBuffer = await generateQrCodeWithText(ticketCode, registration.name, event.name, {
        template: ticketTemplate,
        participantEmail: registration.email,
        answers: registration.answers,
        answerFieldLabels: registration.answerFieldLabels,
      });

      // 6. Upload to Supabase Storage (bucket: tickets)
      const fileName = `${registrationId}-${ticketCode}.png`;
      uploadedFileName = fileName;
      const { data, error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKETS.tickets)
        .upload(fileName, qrBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage.from(STORAGE_BUCKETS.tickets).getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      // 7. Update DB in transaction
      const [updatedRegistration] = await db.transaction(async (tx) => {
        // Will throw if ticket_code is not unique
        return tx.update(registrations)
          .set({
            ticketCode,
            qrCodeUrl: publicUrl
          })
          .where(and(
            eq(registrations.id, registrationId),
            isNull(registrations.ticketCode),
            isNull(registrations.qrCodeUrl),
          ))
          .returning({ id: registrations.id });
      });

      if (!updatedRegistration) {
        await cleanupUnclaimedTicketObject(fileName);
        uploadedFileName = null;
        const [existingRegistration] = await db
          .select({ ticketCode: registrations.ticketCode, qrCodeUrl: registrations.qrCodeUrl })
          .from(registrations)
          .where(eq(registrations.id, registrationId))
          .limit(1);
        if (existingRegistration?.ticketCode && existingRegistration.qrCodeUrl) {
          finalTicketCode = existingRegistration.ticketCode;
          finalQrCodeUrl = existingRegistration.qrCodeUrl;
          break;
        }
        throw new Error('Ticket generation lost its registration update race');
      }

      finalTicketCode = ticketCode;
      finalQrCodeUrl = publicUrl;
      uploadedFileName = null;
      break; // Success, exit loop
    } catch (err: any) {
      if (uploadedFileName) {
        await cleanupUnclaimedTicketObject(uploadedFileName);
        uploadedFileName = null;
      }
      // Check if it's a unique constraint violation (Postgres error code 23505)
      // Drizzle might wrap the error, so check err.code and err.cause.code
      const errString = String(err) + (err.cause ? String(err.cause) : '');
      const isUniqueViolation = 
        err.code === '23505' || 
        err.cause?.code === '23505' || 
        errString.includes('23505') || 
        errString.includes('unique constraint');

      if (isUniqueViolation) {
        console.warn(`Ticket code collision on attempt ${attempt}. Retrying...`);
        if (attempt === maxRetries) {
          const exhaustedError = new Error('Exceeded max retries for ticket generation due to collisions');
          await markTicketGenerationJobFailed(registrationId, exhaustedError);
          throw exhaustedError;
        }
        continue;
      }
      // Re-throw other errors (e.g. storage failures, which rollback the transaction implicitly)
      await markTicketGenerationJobFailed(registrationId, err);
      throw err;
    }
  }

  // 8. Trigger S5-T4
  try {
    await triggerTicketEmailDelivery(registrationId);
    await markTicketGenerationJobCompleted(registrationId);
  } catch (error) {
    await markTicketGenerationJobFailed(registrationId, error);
    throw error;
  }

  return { 
    status: 'success', 
    message: 'Ticket generated successfully', 
    ticketCode: finalTicketCode,
    qrCodeUrl: finalQrCodeUrl
  };
}
