import { db } from '../../db';
import { events, registrations, otps } from '../../db/schema';
import { eq, and, inArray, count, desc } from 'drizzle-orm';

interface RegistrationPayload {
  name: string;
  email: string;
  answers?: any;
  registrationId?: string; // Untuk re-submit form / ubah email
}

export async function processRegistrationAction(slug: string, payload: RegistrationPayload) {
  return await db.transaction(async (tx) => {
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

    // 2. Hitung jumlah pendaftaran (Draft, Pending, Accepted)
    const countResult = await tx
      .select({ count: count() })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, event.id),
          inArray(registrations.status, ['Draft', 'Pending', 'Accepted'])
        )
      );
    
    let currentCount = countResult[0].count;

    // Jika sedang update registrasi yang statusnya Draft/Pending, dia sudah masuk hitungan count() di atas.
    // Oleh karena itu, pengecekan kuota melebihi kapasitas ini bisa diandalkan.
    if (currentCount >= event.capacity && !payload.registrationId) {
      throw new Error('QuotaExceededException: Event capacity reached');
    }

    let status = 'Draft';
    if (event.registrationMode === 'Auto-Accept') {
      status = 'Accepted';
    }

    const regData = {
      eventId: event.id,
      name: payload.name,
      email: payload.email,
      answers: payload.answers || {},
      status,
    };

    let registrationId = payload.registrationId;

    if (registrationId) {
      // Update existing
      const [updated] = await tx
        .update(registrations)
        .set(regData)
        .where(eq(registrations.id, registrationId))
        .returning({ id: registrations.id, status: registrations.status });
      registrationId = updated.id;
    } else {
      // Insert new
      const [inserted] = await tx
        .insert(registrations)
        .values(regData)
        .returning({ id: registrations.id, status: registrations.status });
      registrationId = inserted.id;
    }

    let otpCode = null;
    if (status === 'Draft' && event.registrationMode === 'Manual Review') {
      // Generate OTP
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await tx.insert(otps).values({
        registrationId,
        otpCode,
        expiresAt,
        isUsed: false,
      });
      // OTP bisa dikirim via service eksternal setelah pemanggilan fungsi ini
    }

    return { registrationId, status, otpCode };
  });
}

export async function verifyOtpAction(registrationId: string, otpCode: string) {
  return await db.transaction(async (tx) => {
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
      throw new Error('InvalidOTP: OTP expired');
    }

    // Tandai dipakai
    await tx.update(otps)
      .set({ isUsed: true })
      .where(eq(otps.id, otpRecord.id));

    // Update status pendaftaran menjadi Pending untuk direview
    const [reg] = await tx.update(registrations)
      .set({ status: 'Pending' })
      .where(eq(registrations.id, registrationId))
      .returning({ id: registrations.id, status: registrations.status });

    return reg;
  });
}
