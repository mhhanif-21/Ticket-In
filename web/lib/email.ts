import { sendEmail } from './services/brevo';
import type { ApprovalEmailTemplate } from './tickets/ticketTemplate';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}

function renderOtpEmailTemplate(
  template: ApprovalEmailTemplate,
  input: { name: string; email: string; eventName: string; code: string },
): { subject: string; htmlContent: string } {
  const values = new Map<string, string>([
    ['NAME', input.name],
    ['EMAIL', input.email],
    ['EVENT_NAME', input.eventName],
    ['CODE', input.code],
  ]);
  let subject = template.subject;
  let body = escapeHtml(template.body).replace(/\r?\n/g, '<br>');
  for (const [token, value] of values) {
    subject = subject.split(`[${token}]`).join(value);
    body = body.split(`[${token}]`).join(escapeHtml(value));
  }
  return {
    subject: subject.replace(/[\r\n]+/g, ' ').trim(),
    htmlContent: `<div>${body}</div>`,
  };
}

export async function sendOtpEmail(
  toEmail: string,
  toName: string,
  otpCode: string,
  eventName: string = 'Event Gate',
  customTemplate?: ApprovalEmailTemplate | null,
) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const configuredSenderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderEmail = configuredSenderEmail || 'noreply@eventgate.com';
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Panitia Event';

  if (!apiKey) {
    console.error('OTP email configuration missing', {
      apiKeyConfigured: false,
      senderEmailConfigured: Boolean(configuredSenderEmail),
    });
    throw new Error('OTP email service is not configured');
  }

  const renderedTemplate = customTemplate
    ? renderOtpEmailTemplate(customTemplate, {
      name: toName,
      email: toEmail,
      eventName,
      code: otpCode,
    })
    : {
      subject: `Kode Verifikasi Pendaftaran - ${eventName}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #4f46e5; text-align: center;">Verifikasi Pendaftaran Anda</h2>
          <p style="color: #374151; font-size: 16px;">Halo <strong>${escapeHtml(toName)}</strong>,</p>
          <p style="color: #374151; font-size: 16px;">Terima kasih telah mendaftar. Untuk melanjutkan proses pendaftaran, silakan gunakan kode OTP berikut:</p>

          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111827;">${escapeHtml(otpCode)}</span>
          </div>

          <p style="color: #6b7280; font-size: 14px; text-align: center;">Kode OTP ini hanya berlaku selama 10 menit. Jangan berikan kode ini kepada siapa pun.</p>
          <hr style="border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Pesan ini dihasilkan secara otomatis, mohon untuk tidak membalas.</p>
        </div>
      `,
    };

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName }],
    subject: renderedTemplate.subject,
    htmlContent: renderedTemplate.htmlContent,
  };

  try {
    // sendEmail owns the bounded 3-second provider timeout. Do not expose the
    // provider response or OTP in an exception returned to the registration API.
    await sendEmail(payload);
  } catch (error) {
    console.error('OTP email delivery failed', {
      apiKeyConfigured: true,
      senderEmailConfigured: Boolean(configuredSenderEmail),
      error: error instanceof Error ? error.message : 'Unknown Brevo email error',
    });
    throw new Error('OTP email delivery failed');
  }
}
