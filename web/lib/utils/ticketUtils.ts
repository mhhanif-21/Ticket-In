import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const TICKET_FONT_FAMILY = 'Noto Sans';
const TICKET_FONT_DIRECTORY = path.join(process.cwd(), 'assets', 'fonts');
const TICKET_FONT_CONFIG_DIRECTORY = path.join('/tmp', 'ticketin-fontconfig');
const TICKET_FONT_CONFIG_PATH = path.join(TICKET_FONT_CONFIG_DIRECTORY, 'fonts.conf');
const TICKET_FONT_CACHE_DIRECTORY = path.join('/tmp', 'ticketin-font-cache');
const TICKET_FONT_FILES = ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf'] as const;
let ticketFontConfigReady = false;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return character;
    }
  });
}

function ensureTicketFontConfig(): void {
  if (ticketFontConfigReady) {
    return;
  }

  const missingFont = TICKET_FONT_FILES.find(
    (fontFile) => !fs.existsSync(path.join(TICKET_FONT_DIRECTORY, fontFile)),
  );
  if (missingFont) {
    throw new Error(`Ticket font asset is missing: ${missingFont}`);
  }

  fs.mkdirSync(TICKET_FONT_CONFIG_DIRECTORY, { recursive: true });
  fs.mkdirSync(TICKET_FONT_CACHE_DIRECTORY, { recursive: true });
  fs.writeFileSync(
    TICKET_FONT_CONFIG_PATH,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(TICKET_FONT_DIRECTORY)}</dir>
  <cachedir>${escapeXml(TICKET_FONT_CACHE_DIRECTORY)}</cachedir>
</fontconfig>
`,
    'utf8',
  );

  // Sharp/librsvg resolves SVG <text> through fontconfig on Linux. Keep the
  // config and cache in /tmp, which is writable in Vercel serverless workers.
  process.env.FONTCONFIG_FILE = TICKET_FONT_CONFIG_PATH;
  process.env.FONTCONFIG_PATH = TICKET_FONT_CONFIG_DIRECTORY;
  ticketFontConfigReady = true;
}

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

export async function generateQrCodeWithText(ticketCode: string, participantName: string, eventName: string): Promise<Buffer> {
  ensureTicketFontConfig();

  // 1. Generate the base QR Code as a Buffer
  const qrBuffer = await QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 2,
    width: 300,
  });

  // 2. Generate an SVG containing the text to composite on top (or below) the QR Code.
  // We'll create a nice vertical ticket layout:
  // 600px width, 800px height.
  // Top section: Event Name
  // Middle section: QR Code
  // Bottom section: Participant Name & Ticket Code
  const width = 500;
  const height = 750;

  // Escape HTML characters in names
  const safeName = participantName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeEvent = eventName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svgText = `
    <svg width="${width}" height="${height}">
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#ffffff"/>
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="none" stroke="#e5e7eb" stroke-width="2"/>

      <!-- Top Section: Event Info -->
      <rect x="0" y="0" width="${width}" height="140" fill="#4f46e5" rx="24"/>
      <rect x="0" y="100" width="${width}" height="40" fill="#4f46e5"/> <!-- To square bottom of header -->
      <text x="50%" y="70" font-family="${TICKET_FONT_FAMILY}" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">
        TICKET KELUAR MASUK
      </text>
      <text x="50%" y="110" font-family="${TICKET_FONT_FAMILY}" font-size="20" font-weight="normal" fill="#e0e7ff" text-anchor="middle">
        ${safeEvent}
      </text>

      <!-- Bottom Section: Participant & Ticket Code -->
      <text x="50%" y="540" font-family="${TICKET_FONT_FAMILY}" font-size="16" fill="#6b7280" text-anchor="middle" letter-spacing="2">
        NAMA PESERTA
      </text>
      <text x="50%" y="580" font-family="${TICKET_FONT_FAMILY}" font-size="32" font-weight="bold" fill="#111827" text-anchor="middle">
        ${safeName}
      </text>

      <!-- Divider -->
      <line x1="40" y1="620" x2="460" y2="620" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="10, 10"/>
      <circle cx="0" cy="620" r="16" fill="#f3f4f6"/>
      <circle cx="500" cy="620" r="16" fill="#f3f4f6"/>

      <text x="50%" y="670" font-family="${TICKET_FONT_FAMILY}" font-size="16" fill="#6b7280" text-anchor="middle" letter-spacing="2">
        KODE TIKET
      </text>
      <text x="50%" y="710" font-family="${TICKET_FONT_FAMILY}" font-size="36" font-weight="bold" fill="#4f46e5" text-anchor="middle" letter-spacing="4">
        ${ticketCode}
      </text>
    </svg>
  `;

  // 3. Composite using sharp
  const finalImageBuffer = await sharp(Buffer.from(svgText))
    .composite([
      {
        input: qrBuffer,
        top: 180, // Position QR Code in the middle
        left: 100, // (500 - 300) / 2
      }
    ])
    .png()
    .toBuffer();

  return finalImageBuffer;
}
