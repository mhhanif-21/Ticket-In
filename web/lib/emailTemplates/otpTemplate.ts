import { escapeEmailHtml, resolveEmailLogoUrl } from './shared';

export interface DefaultOtpEmailInput {
  name: string;
  code: string;
  whatsappGroupUrl: string | null;
}

/**
 * Default Manual Review OTP email. Events that activate a custom OTP template
 * override this default; otherwise this branded design is used.
 */
export function renderDefaultOtpEmail(input: DefaultOtpEmailInput): {
  subject: string;
  htmlContent: string;
} {
  const logoUrl = resolveEmailLogoUrl();
  const name = escapeEmailHtml(input.name);
  const code = escapeEmailHtml(input.code);

  const groupSection = input.whatsappGroupUrl
    ? `
  <!-- Divider -->
  <tr><td align="center" bgcolor="#0B1630" style="background:#0B1630;padding:4px 44px;">
    <div style="border-top:1px solid #243457;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>

  <!-- Group -->
  <tr><td align="center" bgcolor="#0B1630" style="background:#0B1630;padding:28px 44px 8px;color:#C9D0E0;font-size:15px;line-height:1.8;">
    <div style="color:#D4B53F;font-size:11px;letter-spacing:5px;">KOMUNITAS PESERTA</div>
    <h2 style="margin:12px 0 10px;color:#FFFFFF;font-family:Georgia,serif;font-weight:normal;font-size:22px;">Bergabung ke Grup Resmi</h2>
    <p style="margin:0;">Dapatkan jadwal, pengumuman, dan informasi terbaru langsung dari panitia.</p>
  </td></tr>
  <tr><td align="center" bgcolor="#0B1630" style="background:#0B1630;padding:24px 44px 40px;">
    <a href="${escapeEmailHtml(input.whatsappGroupUrl)}" target="_blank" style="display:inline-block;background:#D4B53F;background-image:linear-gradient(180deg,#F0DC7A,#C9A93F);color:#0B1630;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:3px;padding:16px 44px;">GABUNG GRUP</a>
    <p style="margin:16px 0 0;font-size:12px;color:#8E99B3;word-break:break-all;">atau salin tautan: <a href="${escapeEmailHtml(input.whatsappGroupUrl)}" style="color:#D4B53F;">${escapeEmailHtml(input.whatsappGroupUrl)}</a></p>
  </td></tr>`
    : '';

  return {
    subject: 'Verifikasi Email - Engineering Career Expo',
    htmlContent: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Verifikasi Email - Engineering Career Expo</title>
</head>
<body style="margin:0;padding:0;background:#070E1C;font-family:Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;color:#070E1C;">Kode OTP Anda: ${code}. Berlaku 10 menit.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070E1C;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border:1px solid #B79B34;">

  <!-- Logo band -->
  <tr><td align="center" style="background:#FFFFFF;padding:30px 24px 22px;">
    <img src="${logoUrl}" alt="Engineering Career Expo - BEM FT UNILA" width="190" style="display:block;width:190px;max-width:60%;height:auto;border:0;">
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:#D4B53F;background-image:linear-gradient(90deg,#9C8330,#F0DC7A,#9C8330);">&nbsp;</td></tr>

  <!-- Hero -->
  <tr><td align="center" bgcolor="#0F1E40" style="background:#0F1E40;background-image:linear-gradient(180deg,#14275A,#0B1630);padding:48px 40px 40px;">
    <div style="color:#D4B53F;font-size:11px;letter-spacing:5px;">VERIFIKASI EMAIL</div>
    <div style="width:48px;height:1px;background:#D4B53F;margin:18px auto;line-height:1px;font-size:0;">&nbsp;</div>
    <h1 style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:30px;line-height:1.3;">Selamat Datang di<br><span style="color:#E8CF63;">Engineering Career Expo</span></h1>
    <p style="margin:18px 0 0;color:#AEB7CC;font-size:14px;letter-spacing:1px;">Universitas Lampung</p>
  </td></tr>

  <!-- Body -->
  <tr><td bgcolor="#0B1630" style="background:#0B1630;padding:8px 44px 8px;color:#C9D0E0;font-size:15px;line-height:1.8;">
    <p style="margin:0 0 14px;color:#FFFFFF;font-family:Georgia,serif;font-size:18px;">Halo, ${name}</p>
    <p style="margin:0;">Terima kasih telah mendaftar. Masukkan kode berikut untuk memverifikasi alamat email Anda dan melanjutkan pendaftaran.</p>
  </td></tr>

  <!-- OTP -->
  <tr><td align="center" bgcolor="#0B1630" style="background:#0B1630;padding:28px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D4B53F;background:#0F1E40;">
      <tr><td align="center" style="padding:26px 12px 24px;">
        <div style="color:#D4B53F;font-size:10px;letter-spacing:5px;">KODE OTP</div>
        <div style="font-family:'Courier New',monospace;font-size:44px;font-weight:bold;letter-spacing:14px;color:#F3E39A;padding:12px 0 6px 14px;">${code}</div>
        <div style="color:#8E99B3;font-size:12px;">Berlaku selama 10 menit &middot; Jangan bagikan kepada siapa pun</div>
      </td></tr>
    </table>
  </td></tr>
${groupSection}
  <!-- Footer -->
  <tr><td align="center" bgcolor="#060C19" style="background:#060C19;border-top:1px solid #243457;padding:28px 24px;">
    <div style="color:#FFFFFF;font-family:Georgia,serif;font-size:14px;letter-spacing:3px;">ENGINEERING CAREER EXPO</div>
    <div style="color:#D4B53F;font-size:11px;letter-spacing:3px;margin-top:6px;">BEM FT UNIVERSITAS LAMPUNG</div>
    <div style="color:#6C7690;font-size:11px;margin-top:16px;line-height:1.6;">Jika Anda tidak merasa mendaftar, abaikan email ini.<br>Email dikirim otomatis, mohon tidak membalas.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  };
}
