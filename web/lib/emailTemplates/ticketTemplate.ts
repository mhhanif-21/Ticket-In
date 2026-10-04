import {
  escapeEmailHtml,
  formatEventDate,
  formatEventTime,
  resolveEmailLogoUrl,
} from './shared';

export interface DefaultTicketEmailInput {
  name: string;
  ticketCode: string;
  qrCodeUrl: string;
  date: Date;
  location: string;
}

/**
 * Default Manual Review acceptance email with the participant QR ticket.
 * Events that activate a custom ticket template override this default.
 */
export function renderDefaultTicketEmail(input: DefaultTicketEmailInput): {
  subject: string;
  htmlContent: string;
} {
  const logoUrl = resolveEmailLogoUrl();
  const name = escapeEmailHtml(input.name);
  const ticketCode = escapeEmailHtml(input.ticketCode);
  const qrCodeUrl = escapeEmailHtml(input.qrCodeUrl);
  const date = escapeEmailHtml(formatEventDate(input.date));
  const time = escapeEmailHtml(formatEventTime(input.date));
  const location = escapeEmailHtml(input.location);

  return {
    subject: 'Tiket Peserta - Engineering Career Expo',
    htmlContent: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Tiket Peserta - Engineering Career Expo</title>
</head>
<body style="margin:0;padding:0;background:#070E1C;font-family:Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;color:#070E1C;">Selamat! Anda diterima. Tiket QR Anda ada di dalam email ini.</div>

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
    <div style="color:#D4B53F;font-size:11px;letter-spacing:5px;">PENDAFTARAN DITERIMA</div>
    <div style="width:48px;height:1px;background:#D4B53F;margin:18px auto;line-height:1px;font-size:0;">&nbsp;</div>
    <h1 style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.3;">Selamat, <span style="color:#E8CF63;">Anda Diterima</span></h1>
    <p style="margin:16px 0 0;color:#AEB7CC;font-size:14px;line-height:1.7;">Anda resmi menjadi peserta<br>Engineering Career Expo Universitas Lampung</p>
  </td></tr>

  <!-- Intro -->
  <tr><td bgcolor="#0B1630" style="background:#0B1630;padding:8px 44px;color:#C9D0E0;font-size:15px;line-height:1.8;">
    <p style="margin:0 0 14px;color:#FFFFFF;font-family:Georgia,serif;font-size:18px;">Halo, ${name}</p>
    <p style="margin:0;">Tunjukkan tiket di bawah ini kepada panitia saat registrasi di lokasi acara.</p>
  </td></tr>

  <!-- Ticket -->
  <tr><td align="center" bgcolor="#0B1630" style="background:#0B1630;padding:28px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D4B53F;background:#0F1E40;">
      <tr><td align="center" style="padding:16px;border-bottom:1px solid #D4B53F;color:#D4B53F;font-size:11px;letter-spacing:6px;">TIKET MASUK</td></tr>
      <tr><td align="center" style="padding:28px 20px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:3px solid #D4B53F;">
          <tr><td style="padding:14px;"><img src="${qrCodeUrl}" alt="QR Code Tiket" width="190" height="190" style="display:block;width:190px;height:190px;border:0;"></td></tr>
        </table>
        <div style="color:#8E99B3;font-size:12px;margin-top:14px;letter-spacing:1px;">Pindai QR di meja registrasi</div>
      </td></tr>
      <tr><td style="padding:0 24px;"><div style="border-top:1px dashed #4A5B85;font-size:0;line-height:0;">&nbsp;</div></td></tr>
      <tr><td align="center" style="padding:22px 20px 28px;">
        <div style="color:#D4B53F;font-size:10px;letter-spacing:5px;">KODE UNIK CADANGAN</div>
        <div style="font-family:'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:#F3E39A;padding:10px 0 6px 6px;">${ticketCode}</div>
        <div style="color:#8E99B3;font-size:12px;">Gunakan jika QR tidak dapat dipindai</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Details -->
  <tr><td bgcolor="#0B1630" style="background:#0B1630;padding:0 44px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <tr><td style="padding:14px 0;border-top:1px solid #243457;color:#D4B53F;font-size:10px;letter-spacing:4px;width:30%;">NAMA</td><td style="padding:14px 0;border-top:1px solid #243457;color:#FFFFFF;">${name}</td></tr>
      <tr><td style="padding:14px 0;border-top:1px solid #243457;color:#D4B53F;font-size:10px;letter-spacing:4px;">TANGGAL</td><td style="padding:14px 0;border-top:1px solid #243457;color:#FFFFFF;">${date}</td></tr>
      <tr><td style="padding:14px 0;border-top:1px solid #243457;color:#D4B53F;font-size:10px;letter-spacing:4px;">WAKTU</td><td style="padding:14px 0;border-top:1px solid #243457;color:#FFFFFF;">${time}</td></tr>
      <tr><td style="padding:14px 0;border-top:1px solid #243457;border-bottom:1px solid #243457;color:#D4B53F;font-size:10px;letter-spacing:4px;">LOKASI</td><td style="padding:14px 0;border-top:1px solid #243457;border-bottom:1px solid #243457;color:#FFFFFF;">${location}</td></tr>
    </table>
  </td></tr>

  <!-- Notes -->
  <tr><td bgcolor="#0B1630" style="background:#0B1630;padding:24px 44px 40px;color:#9AA4BC;font-size:13px;line-height:1.9;">
    <div style="color:#D4B53F;font-size:10px;letter-spacing:4px;margin-bottom:8px;">CATATAN PENTING</div>
    &#9670;&nbsp; Simpan atau screenshot email ini sebelum hari acara.<br>
    &#9670;&nbsp; Satu QR hanya berlaku untuk satu peserta.<br>
    &#9670;&nbsp; Jangan bagikan QR dan kode unik kepada siapa pun.<br>
    &#9670;&nbsp; Hadir 30 menit sebelum acara dimulai.
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" bgcolor="#060C19" style="background:#060C19;border-top:1px solid #243457;padding:28px 24px;">
    <div style="color:#FFFFFF;font-family:Georgia,serif;font-size:14px;letter-spacing:3px;">ENGINEERING CAREER EXPO</div>
    <div style="color:#D4B53F;font-size:11px;letter-spacing:3px;margin-top:6px;">BEM FT UNIVERSITAS LAMPUNG</div>
    <div style="color:#6C7690;font-size:11px;margin-top:16px;">Email dikirim otomatis, mohon tidak membalas.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  };
}
