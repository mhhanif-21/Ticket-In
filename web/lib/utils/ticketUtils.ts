import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  TICKET_TEMPLATE_CANVAS_WIDTH,
  getTicketTemplateTextColor,
  getTicketTemplateFontSize,
  getTicketTemplateTextPosition,
  resolveRegistrationFieldToken,
  type TicketTemplateConfig,
  type TicketTemplateElement,
} from '@/lib/tickets/ticketTemplate';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';

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

type TicketRenderOptions = {
  template?: TicketTemplateConfig;
  participantEmail?: string;
  answers?: unknown;
  answerFieldLabels?: unknown;
};

function getTemplateText(
  element: TicketTemplateElement,
  input: {
    ticketCode: string;
    participantName: string;
    participantEmail: string;
    eventName: string;
    answers: unknown;
    answerFieldLabels: unknown;
  },
): string {
  switch (element.type) {
    case 'ticket_code':
      return input.ticketCode;
    case 'name':
      return input.participantName || '-';
    case 'email':
      return input.participantEmail || '-';
    case 'event_name':
      return input.eventName || '-';
    case 'field':
      return resolveRegistrationFieldToken(element.token ?? '', input.answers, input.answerFieldLabels);
    default:
      return '-';
  }
}

async function generateCustomTicket(
  ticketCode: string,
  participantName: string,
  eventName: string,
  template: TicketTemplateConfig,
  options: TicketRenderOptions,
): Promise<Buffer> {
  if (!template.backgroundPath) {
    throw new Error('Custom ticket template background is missing');
  }
  ensureTicketFontConfig();

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKETS.ticketTemplates)
    .download(template.backgroundPath);
  if (error || !data) {
    throw new Error('Custom ticket template background could not be loaded');
  }

  // Bounding the rendered pixel count protects the serverless worker from a
  // valid-but-extremely-large source image while retaining its original ratio.
  const normalizedBackground = await sharp(Buffer.from(await data.arrayBuffer()))
    .rotate()
    .resize({ width: TICKET_TEMPLATE_CANVAS_WIDTH, height: 1600, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(normalizedBackground).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Custom ticket template dimensions are invalid');
  }

  const qrBuffer = await QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 2,
    width: 300,
  });
  const context = {
    ticketCode,
    participantName,
    participantEmail: options.participantEmail ?? '',
    eventName,
    answers: options.answers,
    answerFieldLabels: options.answerFieldLabels,
  };
  const composites: sharp.OverlayOptions[] = [];

  for (const element of template.elements) {
    const left = Math.round(element.x * metadata.width);
    const top = Math.round(element.y * metadata.height);
    const width = Math.max(1, Math.round(element.width * metadata.width));
    const height = Math.max(1, Math.round(element.height * metadata.height));

    if (element.type === 'qr') {
      const qrSize = Math.min(width, height);
      composites.push({
        input: await sharp(qrBuffer).resize({ width: qrSize, height: qrSize, fit: 'contain' }).png().toBuffer(),
        left: left + Math.floor((width - qrSize) / 2),
        top: top + Math.floor((height - qrSize) / 2),
      });
      continue;
    }

    const text = escapeXml(getTemplateText(element, context));
    const fontSize = Math.max(12, Math.min(120, Math.round(getTicketTemplateFontSize(element.fontSize))));
    const textPosition = getTicketTemplateTextPosition(width, height, fontSize);
    const textColor = escapeXml(getTicketTemplateTextColor(element.color));
    const textSvg = Buffer.from(
      `<svg width="${width}" height="${height}">
        <text x="${textPosition.x}" y="${textPosition.y}" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="${fontSize}" font-weight="bold" fill="${textColor}">${text}</text>
      </svg>`,
    );
    composites.push({ input: textSvg, left, top });
  }

  return sharp(normalizedBackground).composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

const TICKET_LOGO_FILE_NAMES = ['logo-ecx.jpeg', 'logo-ecx.png', 'logo.jpeg'] as const;
const TICKET_LOGO_DIRECTORIES = ['public', 'assets'] as const;

function loadTicketLogoBuffer(): Buffer | null {
  for (const directory of TICKET_LOGO_DIRECTORIES) {
    for (const fileName of TICKET_LOGO_FILE_NAMES) {
      const candidate = path.join(process.cwd(), directory, fileName);
      try {
        if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
      } catch {
        // Ignore unreadable candidates and continue searching.
      }
    }
  }
  return null;
}

function clampTicketText(value: string, maxLength: number): string {
  const normalized = (value ?? '').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

/**
 * Builds the default ticket artwork that matches the Engineering Career Expo
 * email theme. The single image contains the branding, event, participant,
 * QR code, and ticket code so a download yields the full ticket.
 */
async function generateDefaultQrCodeWithText(ticketCode: string, participantName: string, eventName: string): Promise<Buffer> {
  ensureTicketFontConfig();

  const width = 720;
  const height = 1240;
  const gold = '#D4B53F';
  const goldLight = '#F3E39A';
  const cardBackground = '#0F1E40';
  const muted = '#8E99B3';
  const divider = '#4A5B85';

  const safeEvent = escapeXml(clampTicketText(eventName, 32) || '-');
  const safeName = escapeXml(clampTicketText(participantName, 26) || '-');
  const safeCode = escapeXml(ticketCode);

  const qrBuffer = await QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 1,
    width: 360,
  });

  const svgText = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="${cardBackground}"/>
    <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="27" fill="none" stroke="${gold}" stroke-width="3"/>

    <rect x="1.5" y="1.5" width="${width - 3}" height="208" rx="27" fill="#FFFFFF"/>
    <rect x="1.5" y="175" width="${width - 3}" height="35" fill="#FFFFFF"/>
    <rect x="1.5" y="209" width="${width - 3}" height="3" fill="${gold}"/>

    <text x="${width / 2}" y="290" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="20" letter-spacing="6" fill="${gold}">TIKET MASUK</text>
    <text x="${width / 2}" y="342" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="34" font-weight="bold" fill="#FFFFFF">${safeEvent}</text>

    <text x="${width / 2}" y="432" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="17" letter-spacing="3" fill="${muted}">NAMA PESERTA</text>
    <text x="${width / 2}" y="482" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="38" font-weight="bold" fill="#FFFFFF">${safeName}</text>

    <rect x="150" y="540" width="420" height="420" rx="18" fill="#FFFFFF" stroke="${gold}" stroke-width="3"/>

    <line x1="60" y1="1030" x2="660" y2="1030" stroke="${divider}" stroke-width="2" stroke-dasharray="12,10"/>

    <text x="${width / 2}" y="1082" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="17" letter-spacing="5" fill="${gold}">KODE TIKET</text>
    <text x="${width / 2}" y="1146" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="52" font-weight="bold" letter-spacing="8" fill="${goldLight}">${safeCode}</text>

    <text x="${width / 2}" y="1202" text-anchor="middle" font-family="${TICKET_FONT_FAMILY}" font-size="16" fill="${muted}">Engineering Career Expo \u00B7 BEM FT UNILA</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];

  const logoBuffer = loadTicketLogoBuffer();
  if (logoBuffer) {
    try {
      const resizedLogo = await sharp(logoBuffer)
        .resize({ width: 190, withoutEnlargement: true })
        .png()
        .toBuffer();
      const logoMetadata = await sharp(resizedLogo).metadata();
      const logoWidth = logoMetadata.width ?? 190;
      composites.push({
        input: resizedLogo,
        top: 12,
        left: Math.round((width - logoWidth) / 2),
      });
    } catch {
      // A broken logo must never block ticket generation.
    }
  }

  composites.push({ input: qrBuffer, top: 570, left: 180 });

  return sharp(Buffer.from(svgText)).composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Renders the default ticket or a validated per-event custom template. The
 * optional context keeps the existing worker/API contract backward compatible.
 */
export async function generateQrCodeWithText(
  ticketCode: string,
  participantName: string,
  eventName: string,
  options: TicketRenderOptions = {},
): Promise<Buffer> {
  if (options.template?.mode === 'custom') {
    return generateCustomTicket(ticketCode, participantName, eventName, options.template, options);
  }
  return generateDefaultQrCodeWithText(ticketCode, participantName, eventName);
}
