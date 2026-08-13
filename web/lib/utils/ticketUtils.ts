import crypto from 'crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';

/**
 * Generates an 8-character random alphanumeric string for a ticket code.
 */
export function generateRandomTicketCode(): string {
  // 8 bytes in hex is 16 chars, we can just use 4 bytes to get 8 chars
  // Or better, explicitly generate from alphanumeric characters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

/**
 * Generates a QR Code image buffer with the given text embedded below the QR code.
 * Follows FR-REG-11.
 * 
 * @param ticketCode 8-character ticket code to encode and display.
 * @returns Buffer containing the PNG image.
 */
export async function generateQrCodeWithText(ticketCode: string): Promise<Buffer> {
  // 1. Generate the base QR Code as a Buffer
  // We specify width to get a decent resolution, margin for padding
  const qrBuffer = await QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 4,
    width: 400,
  });

  // 2. Generate an SVG containing the text to composite on top (or below) the QR Code.
  // The QR Code is 400x400. We'll extend the canvas to 400x450 to make room for text at the bottom.
  const svgText = `
    <svg width="400" height="450">
      <rect x="0" y="0" width="400" height="450" fill="#ffffff"/>
      <text x="50%" y="420" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#000000" text-anchor="middle">
        ${ticketCode}
      </text>
    </svg>
  `;

  // 3. Composite using sharp
  const finalImageBuffer = await sharp(Buffer.from(svgText))
    .composite([
      {
        input: qrBuffer,
        top: 0,
        left: 0,
      }
    ])
    .png()
    .toBuffer();

  return finalImageBuffer;
}
