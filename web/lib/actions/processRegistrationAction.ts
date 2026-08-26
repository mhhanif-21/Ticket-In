import { db } from '../../db';
import { events, formFields, registrations, otps, resubmitTokens } from '../../db/schema';
import { eq, and, inArray, count, desc, sql, isNull, gt } from 'drizzle-orm';
import {
  getRegistrationFieldKey,
  isStaticRegistrationFieldDefinition,
  validateRegistrationAnswers,
  validateRegistrationIdentity,
} from '../validation/registrationForm';
import { getVerifiedResubmitToken, issueResubmitTokenRecord } from '../security/resubmit';
import { rotateRegistrationStatusCapabilityTx } from '../security/publicStatusCapability';
import { ensureTicketGenerationJobTx } from './ticketGenerationJob';
import { assertEventIsPublic } from '../events/eventLifecycle';
import { claimParticipantFileUploadsTx } from '../registration/participantFileLifecycle';
import {
  CAPACITY_CONSUMING_REGISTRATION_STATUSES,
  expireStaleDraftRegistrationsForEventTx,
} from '../registration/draftLifecycle';

interface RegistrationPayload {
  name: string;
  email: string;
  answers?: any;
  registrationId?: string; // Untuk re-submit form / ubah email
  resubmitToken?: string;
  preserveAnswers?: boolean; // Retry delivery tanpa mengirim ulang file/field
  fileUploadIds?: string[];
  fileUploadRequestId?: string;
}

async function invalidateResubmitTokensTx(tx: any, registrationId: string, usedAt = new Date()): Promise<void> {
  await tx
    .update(resubmitTokens)
    .set({ usedAt })
    .where(and(eq(resubmitTokens.registrationId, registrationId), isNull(resubmitTokens.usedAt)));
}

async function issueResubmitTokenTx(
  tx: any,
  input: { registrationId: string; eventId: string; email: string },
): Promise<string> {
  const issued = issueResubmitTokenRecord(input);
  await tx.insert(resubmitTokens).values({
    jti: issued.claims.jti,
    registrationId: input.registrationId,
    eventId: input.eventId,
    normalizedEmail: issued.claims.email,
    tokenHash: issued.tokenHash,
    expiresAt: new Date(issued.claims.exp * 1000),
  });
  return issued.token;
}

export async function processRegistrationAction(slug: string, payload: RegistrationPayload) {
  const identity = validateRegistrationIdentity(payload);
  const result = await db.transaction(async (tx) => {
    // 1. Ambil Event dengan pessimistic lock
    const eventRecords = await tx
      .select()
      .from(events)
      .where(eq(events.slug, slug))
      .for('update')
      .limit(1);

    if (eventRecords.length === 0) {
      throw new Error('NotFoundException: Event not found');
    }
    const event = eventRecords[0];
    assertEventIsPublic(event.status);

    // The event row lock serializes expiry, capacity counting, and insertion
    // for this event. Expired Drafts stop consuming quota before every write.
    await expireStaleDraftRegistrationsForEventTx(tx, event.id);

    const eventFormFields = await tx
      .select({
        id: formFields.id,
        fieldName: formFields.fieldName,
        fieldType: formFields.fieldType,
        isRequired: formFields.isRequired,
        options: formFields.options,
        order: formFields.order,
        fieldKey: formFields.fieldKey,
        fieldKind: formFields.fieldKind,
      })
      .from(formFields)
      .where(eq(formFields.eventId, event.id));

    // BUG-E FIX: Skip field Nama/Email — dihandle sebagai field statis (name/email),
    // bukan sebagai field dinamis dengan key field_{id}
    const dynamicFields = eventFormFields.filter(
      (f) => !isStaticRegistrationFieldDefinition(f)
    ).map((field) => ({
      ...field,
      fieldKey: getRegistrationFieldKey(field),
    }));
    const answerFieldLabels = Object.fromEntries(
      dynamicFields.map((field) => [field.fieldKey, field.fieldName]),
    );

    let registrationId = payload.registrationId;
    if (payload.preserveAnswers && !registrationId) {
      throw new Error('InvalidRegistrationResubmit: retry proof is required');
    }

    // Delivery retry deliberately reuses the already-persisted, validated
    // answers. A normal correction still validates the new multipart payload.
    if (!payload.preserveAnswers) {
      validateRegistrationAnswers(dynamicFields, payload.answers || {});
    }

    const reusedDraftRegistration = Boolean(registrationId);
    const normalizedEmail = identity.email;

    // A delivery retry is idempotent per event and normalized email for both modes.
    // The event row lock serializes concurrent retries before a new registration is inserted.
    if (!registrationId) {
      const [existingRegistration] = await tx
        .select({ id: registrations.id, status: registrations.status })
        .from(registrations)
        .where(and(
          eq(registrations.eventId, event.id),
          sql`lower(${registrations.email}) = ${normalizedEmail}`
        ))
        .orderBy(desc(registrations.createdAt))
        .limit(1)
        .for('update');

      if (existingRegistration && (event.registrationMode === 'Auto-Accept' || ['Pending', 'Accepted', 'Rejected'].includes(existingRegistration.status))) {
        let ticketJobId: string | null = null;
        let ticketJobStatus: string | null = null;
        if (existingRegistration.status === 'Accepted') {
          const ticketJob = await ensureTicketGenerationJobTx(tx, existingRegistration.id);
          ticketJobId = ticketJob.id;
          ticketJobStatus = ticketJob.status;
        }
        return {
          registrationId: existingRegistration.id,
          status: existingRegistration.status,
          otpCode: null,
          reused: true,
          ticketJobId,
          ticketJobStatus,
          resubmitToken: null,
          statusCapability: null,
          statusCapabilityExpiresAt: null,
        };
      }
      if (existingRegistration) {
        // A Draft is mutable only through the one-time proof returned to the
        // original browser. Matching an email is not an ownership proof.
        throw new Error('InvalidRegistrationResubmit: valid ownership token is required for this Draft');
      }
    }

    // 2. Hitung jumlah pendaftaran (Draft, Pending, Accepted)
    const countResult = await tx
      .select({ count: count() })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, event.id),
          inArray(registrations.status, CAPACITY_CONSUMING_REGISTRATION_STATUSES)
        )
      );
    
    const currentCount = countResult[0].count;

    // Jika sedang update registrasi yang statusnya Draft/Pending, dia sudah masuk hitungan count() di atas.
    // Oleh karena itu, pengecekan kuota melebihi kapasitas ini bisa diandalkan.
    if (currentCount >= event.capacity && !registrationId) {
      throw new Error('QuotaExceededException: Event capacity reached');
    }

    let status = 'Draft';
    if (event.registrationMode === 'Auto-Accept') {
      status = 'Accepted';
    }

    const regData = {
      eventId: event.id,
      name: identity.name,
      email: normalizedEmail,
      answers: payload.answers || {},
      answerFieldLabels,
      formVersion: event.formVersion,
      status,
    };

    if (registrationId) {
      const [existingRegistration] = await tx
        .select({
          eventId: registrations.eventId,
          status: registrations.status,
          email: registrations.email,
          answers: registrations.answers,
          answerFieldLabels: registrations.answerFieldLabels,
        })
        .from(registrations)
        .where(eq(registrations.id, registrationId))
        .for('update')
        .limit(1);

      if (
        !existingRegistration
        || existingRegistration.eventId !== event.id
        || existingRegistration.status !== 'Draft'
      ) {
        throw new Error('InvalidRegistrationResubmit: valid ownership token is required for this Draft');
      }

      const verifiedToken = getVerifiedResubmitToken(payload.resubmitToken, {
        registrationId,
        eventId: event.id,
        email: existingRegistration.email,
      });
      if (!verifiedToken) {
        throw new Error('InvalidRegistrationResubmit: valid ownership token is required for this Draft');
      }

      const now = new Date();
      const [consumedToken] = await tx
        .update(resubmitTokens)
        .set({ usedAt: now })
        .where(and(
          eq(resubmitTokens.jti, verifiedToken.jti),
          eq(resubmitTokens.tokenHash, verifiedToken.tokenHash),
          eq(resubmitTokens.registrationId, registrationId),
          eq(resubmitTokens.eventId, event.id),
          eq(resubmitTokens.normalizedEmail, existingRegistration.email.trim().toLowerCase()),
          isNull(resubmitTokens.usedAt),
          gt(resubmitTokens.expiresAt, now),
        ))
        .returning({ id: resubmitTokens.id });

      if (!consumedToken) {
        throw new Error('InvalidRegistrationResubmit: token has already been used or expired');
      }

      const updateData = payload.preserveAnswers
        ? {
          ...regData,
          answers: existingRegistration.answers || {},
          answerFieldLabels: existingRegistration.answerFieldLabels || {},
        }
        : regData;

      const [updated] = await tx
        .update(registrations)
        .set(updateData)
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.eventId, event.id),
            eq(registrations.status, 'Draft')
          )
        )
        .returning({ id: registrations.id, status: registrations.status });

      if (!updated) {
        throw new Error('InvalidRegistrationResubmit: registration must be a Draft for this event');
      }

      registrationId = updated.id;
    } else {
      // Insert new
      const [inserted] = await tx
        .insert(registrations)
        .values(regData)
        .returning({ id: registrations.id, status: registrations.status });
      registrationId = inserted.id;
    }

    if (!payload.preserveAnswers && payload.fileUploadIds?.length) {
      if (!payload.fileUploadRequestId) {
        throw new Error('ParticipantFileClaimFailed: upload ownership proof is required');
      }
      await claimParticipantFileUploadsTx(tx, {
        uploadIds: payload.fileUploadIds,
        requestId: payload.fileUploadRequestId,
        registrationId,
      });
    }

    let ticketJobId: string | null = null;
    let ticketJobStatus: string | null = null;
    if (status === 'Accepted') {
      const ticketJob = await ensureTicketGenerationJobTx(tx, registrationId);
      ticketJobId = ticketJob.id;
      ticketJobStatus = ticketJob.status;
    }

    let otpCode = null;
    if (status === 'Draft' && event.registrationMode === 'Manual Review') {
      // Generate OTP
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await tx.update(otps)
        .set({ isUsed: true })
        .where(and(eq(otps.registrationId, registrationId), eq(otps.isUsed, false)));

      await tx.insert(otps).values({
        registrationId,
        otpCode,
        expiresAt,
        isUsed: false,
      });
      // OTP bisa dikirim via service eksternal setelah pemanggilan fungsi ini
    }

    let resubmitToken: string | null = null;
    if (status === 'Draft') {
      // A successful resubmit rotates the proof. This also revokes any older
      // active proofs issued by an OTP delivery retry.
      await invalidateResubmitTokensTx(tx, registrationId);
      resubmitToken = await issueResubmitTokenTx(tx, {
        registrationId,
        eventId: event.id,
        email: normalizedEmail,
      });
    }

    const statusCapability = await rotateRegistrationStatusCapabilityTx(tx, registrationId);

    return {
      registrationId,
      status,
      otpCode,
      reused: reusedDraftRegistration,
      ticketJobId,
      ticketJobStatus,
      resubmitToken,
      statusCapability: statusCapability.token,
      statusCapabilityExpiresAt: statusCapability.expiresAt,
    };
  });

  return result;
}

export async function verifyOtpAction(registrationId: string, otpCode: string) {
  return await db.transaction(async (tx) => {
    const [registration] = await tx
      .select({ status: registrations.status })
      .from(registrations)
      .where(eq(registrations.id, registrationId))
      .for('update')
      .limit(1);

    if (!registration || registration.status !== 'Draft') {
      throw new Error('InvalidOTP: registration is no longer a Draft');
    }

    // Ambil OTP terbaru dengan lock
    const otpRecords = await tx
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.registrationId, registrationId),
          eq(otps.otpCode, otpCode)
        )
      )
      .orderBy(desc(otps.expiresAt))
      .limit(1)
      .for('update');

    if (otpRecords.length === 0) {
      throw new Error('InvalidOTP: OTP not found or mismatched');
    }

    const otpRecord = otpRecords[0];

    if (otpRecord.isUsed) {
      throw new Error('InvalidOTP: OTP already used');
    }

    if (otpRecord.expiresAt < new Date()) {
      const expiredAt = new Date();
      await tx.update(registrations)
        .set({ status: 'Expired', updatedAt: expiredAt })
        .where(and(eq(registrations.id, registrationId), eq(registrations.status, 'Draft')));
      await invalidateResubmitTokensTx(tx, registrationId, expiredAt);
      throw new Error('InvalidOTP: OTP expired');
    }

    // Tandai dipakai
    await tx.update(otps)
      .set({ isUsed: true })
      .where(eq(otps.id, otpRecord.id));

    // Update status pendaftaran menjadi Pending untuk direview
    const [reg] = await tx.update(registrations)
      .set({ status: 'Pending' })
      .where(and(eq(registrations.id, registrationId), eq(registrations.status, 'Draft')))
      .returning({ id: registrations.id, status: registrations.status });

    if (!reg) {
      throw new Error('InvalidOTP: registration is no longer a Draft');
    }

    await invalidateResubmitTokensTx(tx, registrationId);

    return reg;
  });
}
