export async function sendOtpEmail(toEmail: string, toName: string, otpCode: string, eventName: string = 'Event Gate') {
  const apiKey = process.env.BREVO_API_KEY;
  const apiUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@eventgate.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Panitia Event';

  if (!apiKey) {
    throw new Error('OTP email service is not configured');
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName }],
    subject: `Kode Verifikasi Pendaftaran - ${eventName}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Verifikasi Pendaftaran Anda</h2>
        <p style="color: #374151; font-size: 16px;">Halo <strong>${toName}</strong>,</p>
        <p style="color: #374151; font-size: 16px;">Terima kasih telah mendaftar. Untuk melanjutkan proses pendaftaran, silakan gunakan kode OTP berikut:</p>

        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111827;">${otpCode}</span>
        </div>

        <p style="color: #6b7280; font-size: 14px; text-align: center;">Kode OTP ini hanya berlaku selama 10 menit. Jangan berikan kode ini kepada siapa pun.</p>
        <hr style="border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Pesan ini dihasilkan secara otomatis, mohon untuk tidak membalas.</p>
      </div>
    `
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('Failed to send email via Brevo:', await response.text());
    throw new Error('Failed to send email');
  }
}
