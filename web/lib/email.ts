import { sendEmail } from './services/brevo';
import { renderDefaultOtpEmail } from './emailTemplates/otpTemplate';
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
  input: { name: string; email: string; eventName: string; code: string; whatsappGroupUrl?: string | null },
): { subject: string; htmlContent: string } {
  const values = new Map<string, string>([
    ['NAME', input.name],
    ['EMAIL', input.email],
    ['EVENT_NAME', input.eventName],
    ['CODE', input.code],
    ['WHATSAPP_GROUP_LINK', input.whatsappGroupUrl ?? ''],
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
  whatsappGroupUrl: string | null = null,
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
      whatsappGroupUrl,
    })
    : renderDefaultOtpEmail({
      name: toName,
      code: otpCode,
      whatsappGroupUrl,
    });

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
