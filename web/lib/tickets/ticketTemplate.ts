import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventApprovalEmailTemplates,
  eventTicketTemplates,
} from '@/db/schema';
import {
  ImageContentValidationError,
  validateImageContent,
} from '@/lib/storage/imageValidation';

export const TICKET_TEMPLATE_MAX_FILE_BYTES = 5 * 1024 * 1024;
/**
 * Logical width used by the server renderer for normalized template geometry.
 * Mobile previews scale the same coordinates and font sizes from this width.
 */
export const TICKET_TEMPLATE_CANVAS_WIDTH = 1200;
export const TICKET_TEMPLATE_MIN_FONT_SIZE = 12;
export const TICKET_TEMPLATE_MAX_FONT_SIZE = 48;
export const TICKET_TEMPLATE_DEFAULT_FONT_SIZE = 24;
export const TICKET_TEMPLATE_DEFAULT_TEXT_COLOR = '#111111';
const LEGACY_TICKET_TEMPLATE_MIN_FONT_SCALE = 0.45;
const LEGACY_TICKET_TEMPLATE_MAX_FONT_SCALE = 1;
const TICKET_TEMPLATE_HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type EmailTemplateKind = 'otp' | 'ticket';

export const EMAIL_TEMPLATE_TOKEN_OPTIONS: Record<EmailTemplateKind, readonly string[]> = {
  otp: ['NAME', 'EMAIL', 'EVENT_NAME', 'CODE'],
  ticket: ['NAME', 'EMAIL', 'EVENT_NAME', 'TICKET_IMAGE'],
};

export function isEmailTemplateKind(value: unknown): value is EmailTemplateKind {
  return value === 'otp' || value === 'ticket';
}

export function getEmailTemplateTokenOptions(kind: EmailTemplateKind): string[] {
  return [...EMAIL_TEMPLATE_TOKEN_OPTIONS[kind]];
}

export type TicketTemplateElementType =
  | 'qr'
  | 'ticket_code'
  | 'name'
  | 'email'
  | 'event_name'
  | 'field';

export type TicketTemplateElement = {
  type: TicketTemplateElementType;
  token?: string;
  /** Explicit font size in familiar numeric units; legacy values remain readable. */
  fontSize?: number | 'small' | 'medium' | 'large';
  /** Six-digit sRGB hex color used by both editor and server renderer. */
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TicketTemplateConfig = {
  mode: 'default' | 'custom';
  backgroundPath: string | null;
  elements: TicketTemplateElement[];
};

export type ValidatedTicketTemplateBackground = {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export class TicketTemplateValidationError extends Error {
  constructor(
    readonly code:
      | 'TICKET_TEMPLATE_BACKGROUND_REQUIRED'
      | 'TICKET_TEMPLATE_REQUIRED_ELEMENT_MISSING'
      | 'TICKET_TEMPLATE_ELEMENT_INVALID'
      | 'TICKET_TEMPLATE_BACKGROUND_TOO_LARGE'
      | 'TICKET_TEMPLATE_BACKGROUND_TYPE_NOT_ALLOWED'
      | 'TICKET_TEMPLATE_BACKGROUND_CONTENT_INVALID'
       | 'TICKET_TEMPLATE_BACKGROUND_DIMENSIONS_INVALID'
       | 'EMAIL_TEMPLATE_TOKEN_INVALID'
       | 'EMAIL_TEMPLATE_KIND_INVALID',
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TicketTemplateValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTemplateElementType(value: unknown): value is TicketTemplateElementType {
  return value === 'qr'
    || value === 'ticket_code'
    || value === 'name'
    || value === 'email'
    || value === 'event_name'
    || value === 'field';
}

function isTemplateFontSize(value: unknown): value is NonNullable<TicketTemplateElement['fontSize']> {
  return value === 'small'
    || value === 'medium'
    || value === 'large'
    || (typeof value === 'number'
      && Number.isFinite(value)
      && ((value >= TICKET_TEMPLATE_MIN_FONT_SIZE && value <= TICKET_TEMPLATE_MAX_FONT_SIZE)
        || (value >= LEGACY_TICKET_TEMPLATE_MIN_FONT_SCALE
          && value <= LEGACY_TICKET_TEMPLATE_MAX_FONT_SCALE)));
}

function isTemplateTextColor(value: unknown): value is string {
  return typeof value === 'string' && TICKET_TEMPLATE_HEX_COLOR.test(value.trim());
}

export function getTicketTemplateTextColor(value: unknown): string {
  if (!isTemplateTextColor(value)) return TICKET_TEMPLATE_DEFAULT_TEXT_COLOR;
  return value.trim().toLowerCase();
}

function legacyScaleToFontSize(scale: number): number {
  return Math.round(
    TICKET_TEMPLATE_MIN_FONT_SIZE
      + ((scale - LEGACY_TICKET_TEMPLATE_MIN_FONT_SCALE)
        / (LEGACY_TICKET_TEMPLATE_MAX_FONT_SCALE - LEGACY_TICKET_TEMPLATE_MIN_FONT_SCALE))
        * (TICKET_TEMPLATE_MAX_FONT_SIZE - TICKET_TEMPLATE_MIN_FONT_SIZE),
  );
}

export function getTicketTemplateFontSize(
  fontSize: TicketTemplateElement['fontSize'],
): number {
  if (typeof fontSize === 'number') {
    if (fontSize >= LEGACY_TICKET_TEMPLATE_MIN_FONT_SCALE && fontSize <= LEGACY_TICKET_TEMPLATE_MAX_FONT_SCALE) {
      return legacyScaleToFontSize(fontSize);
    }
    return Math.min(TICKET_TEMPLATE_MAX_FONT_SIZE, Math.max(TICKET_TEMPLATE_MIN_FONT_SIZE, fontSize));
  }
  if (fontSize === 'small') return 16;
  if (fontSize === 'large') return 36;
  return TICKET_TEMPLATE_DEFAULT_FONT_SIZE;
}

export function normalizeTicketTemplateElementFontSize(
  fontSize: TicketTemplateElement['fontSize'],
): number {
  return getTicketTemplateFontSize(fontSize);
}

/**
 * Keep text centered in the same normalized element box in the generated
 * ticket and in the mobile editor. The baseline offset matches the font
 * metrics used by the SVG renderer without adding a background or border.
 */
export function getTicketTemplateTextPosition(
  width: number,
  height: number,
  fontSize: number,
): { x: number; y: number } {
  return {
    x: Math.round(width / 2),
    y: Math.round(height / 2 + fontSize * 0.35),
  };
}

function isNormalizedBox(element: TicketTemplateElement): boolean {
  return Number.isFinite(element.x)
    && Number.isFinite(element.y)
    && Number.isFinite(element.width)
    && Number.isFinite(element.height)
    && element.x >= 0
    && element.y >= 0
    && element.width > 0
    && element.height > 0
    && element.x + element.width <= 1
    && element.y + element.height <= 1;
}

export function parseTicketTemplateElements(value: unknown): TicketTemplateElement[] {
  if (!Array.isArray(value)) {
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_ELEMENT_INVALID',
      422,
      'Posisi atau ukuran elemen template tidak valid.',
    );
  }

  const elements = value.map((item) => {
    if (!isRecord(item) || !isTemplateElementType(item.type)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Posisi atau ukuran elemen template tidak valid.',
      );
    }

    const rawFontSize = item.font_size ?? item.fontSize;
    if (rawFontSize !== undefined && !isTemplateFontSize(rawFontSize)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Ukuran teks template tidak valid.',
      );
    }

    const rawColor = item.color ?? item.text_color;
    if (rawColor !== undefined && !isTemplateTextColor(rawColor)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Warna teks template tidak valid.',
      );
    }

    const normalizedFontSize = rawFontSize === undefined
      ? undefined
      : normalizeTicketTemplateElementFontSize(
        rawFontSize as TicketTemplateElement['fontSize'],
      );

    const element: TicketTemplateElement = {
      type: item.type,
      token: typeof item.token === 'string' ? item.token.trim() : undefined,
      fontSize: normalizedFontSize,
      color: rawColor === undefined ? undefined : getTicketTemplateTextColor(rawColor),
      x: typeof item.x === 'number' ? item.x : Number.NaN,
      y: typeof item.y === 'number' ? item.y : Number.NaN,
      width: typeof item.width === 'number' ? item.width : Number.NaN,
      height: typeof item.height === 'number' ? item.height : Number.NaN,
    };

    if (!isNormalizedBox(element) || (element.type === 'field' && !element.token)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Posisi atau ukuran elemen template tidak valid.',
      );
    }

    return element;
  });

  if (elements.filter((element) => element.type === 'qr').length !== 1
    || elements.filter((element) => element.type === 'ticket_code').length !== 1) {
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_REQUIRED_ELEMENT_MISSING',
      422,
      'Template kustom wajib memiliki satu QR Code dan satu kode tiket.',
    );
  }

  const seenOptionalElements = new Set<string>();
  for (const element of elements) {
    const identity = element.type === 'field'
      ? `field:${element.token}`
      : ['name', 'email', 'event_name'].includes(element.type)
        ? element.type
        : null;
    if (identity && seenOptionalElements.has(identity)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Setiap elemen data peserta hanya boleh ditambahkan satu kali.',
      );
    }
    if (identity) seenOptionalElements.add(identity);
  }

  return elements;
}

export function getUniqueFieldLabels(fields: Array<{ fieldName: string }>): string[] {
  const counts = new Map<string, number>();
  for (const field of fields) {
    const label = field.fieldName.trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count === 1)
    .map(([label]) => label);
}

export function validateTemplateFieldTokens(
  elements: TicketTemplateElement[],
  allowedFieldLabels: string[],
): void {
  const allowed = new Set(allowedFieldLabels);
  if (elements.some((element) => element.type === 'field' && !allowed.has(element.token ?? ''))) {
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_ELEMENT_INVALID',
      422,
      'Token data peserta tidak tersedia untuk event ini.',
    );
  }
}

export async function validateTicketTemplateBackground(
  file: File,
): Promise<ValidatedTicketTemplateBackground> {
  if (file.size > TICKET_TEMPLATE_MAX_FILE_BYTES) {
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_BACKGROUND_TOO_LARGE',
      413,
      'Ukuran gambar template melebihi batas 5 MB.',
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const image = await validateImageContent(bytes);
    return { bytes, mimeType: image.mimeType };
  } catch (error) {
    if (!(error instanceof ImageContentValidationError)) throw error;
    if (error.kind === 'dimensions') {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_BACKGROUND_DIMENSIONS_INVALID',
        422,
        'Dimensi gambar template terlalu besar. Maksimal 8192 px per sisi dan 20 megapiksel.',
      );
    }
    if (error.kind === 'content') {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_BACKGROUND_CONTENT_INVALID',
        415,
        'Isi gambar template tidak valid.',
      );
    }
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_BACKGROUND_TYPE_NOT_ALLOWED',
      415,
      'Format gambar template tidak didukung. Gunakan JPG, PNG, atau WebP.',
    );
  }
}

export async function getTicketTemplateConfig(eventId: string): Promise<TicketTemplateConfig> {
  const [template] = await db
    .select({
      mode: eventTicketTemplates.mode,
      backgroundPath: eventTicketTemplates.backgroundPath,
      elements: eventTicketTemplates.elements,
    })
    .from(eventTicketTemplates)
    .where(eq(eventTicketTemplates.eventId, eventId))
    .limit(1);

  if (!template) {
    return { mode: 'default', backgroundPath: null, elements: [] };
  }

  return {
    mode: template.mode === 'custom' ? 'custom' : 'default',
    backgroundPath: template.backgroundPath,
    elements: Array.isArray(template.elements) ? template.elements as TicketTemplateElement[] : [],
  };
}

export async function getActiveEmailTemplate(eventId: string, kind: EmailTemplateKind = 'ticket') {
  const [template] = await db
    .select({
      templateKind: eventApprovalEmailTemplates.templateKind,
      isActive: eventApprovalEmailTemplates.isActive,
      subject: eventApprovalEmailTemplates.subject,
      body: eventApprovalEmailTemplates.body,
    })
    .from(eventApprovalEmailTemplates)
    .where(and(
      eq(eventApprovalEmailTemplates.eventId, eventId),
      eq(eventApprovalEmailTemplates.templateKind, kind),
    ))
    .limit(1);

  if (!template?.isActive) return null;
  const normalized = normalizeEmailTemplateContent(kind, template.subject, template.body);
  return { ...template, ...normalized, templateKind: kind };
}

// Compatibility alias for existing ticket-delivery callers.
export const getActiveApprovalEmailTemplate = (eventId: string) =>
  getActiveEmailTemplate(eventId, 'ticket');

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function answerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.map(answerValue).join(', ');
  if (isRecord(value) && typeof value.fileName === 'string') return value.fileName;
  return String(value);
}

export function resolveRegistrationFieldToken(
  label: string,
  answers: unknown,
  answerFieldLabels: unknown,
): string {
  if (!isRecord(answers) || !isRecord(answerFieldLabels)) return '-';
  const key = Object.entries(answerFieldLabels)
    .find(([, value]) => value === label)?.[0];
  return key ? answerValue(answers[key]) : '-';
}

export type ApprovalEmailTemplate = {
  templateKind?: EmailTemplateKind;
  subject: string;
  body: string;
};

/**
 * 0014 made the ticket and OTP contracts separate. Older approval templates
 * were migrated as ticket templates and could still contain the OTP-only
 * [CODE] token, so remove that known legacy token at every read/write
 * boundary. Unknown tokens remain untouched and are still rejected by the
 * validator instead of being silently accepted.
 */
export function normalizeEmailTemplateContent(
  kind: EmailTemplateKind,
  subject: string,
  body: string,
): Pick<ApprovalEmailTemplate, 'subject' | 'body'> {
  if (kind !== 'ticket') return { subject, body };

  return {
    subject: subject.replace(/\[CODE\]/gi, '').replace(/[ \t]{2,}/g, ' ').trim(),
    body: body.replace(/\[CODE\]/gi, ''),
  };
}

export function validateApprovalEmailTemplateTokens(
  subject: string,
  body: string,
  allowedFieldLabels: string[],
  kind: EmailTemplateKind = 'ticket',
): void {
  const allowed = new Set([
    ...EMAIL_TEMPLATE_TOKEN_OPTIONS[kind],
    ...(kind === 'ticket' ? allowedFieldLabels : []),
  ]);
  const tokens = `${subject}\n${body}`.match(/\[([^\]\r\n]{1,80})\]/g) ?? [];
  const invalid = (kind === 'ticket' && subject.includes('[TICKET_IMAGE]'))
    || tokens.some((token) => !allowed.has(token.slice(1, -1)));
  if (invalid) {
    throw new TicketTemplateValidationError(
      'EMAIL_TEMPLATE_TOKEN_INVALID',
      422,
      'Token email tidak tersedia untuk event ini.',
    );
  }
}

export function renderApprovalEmailTemplate(
  template: ApprovalEmailTemplate,
  input: {
    name: string;
    email: string;
    eventName: string;
    ticketCode?: string;
    ticketImageUrl?: string;
    answers?: unknown;
    answerFieldLabels?: unknown;
  },
  kind: EmailTemplateKind = template.templateKind ?? 'ticket',
): { subject: string; htmlContent: string } {
  const dynamicValues = kind === 'ticket' && isRecord(input.answerFieldLabels)
    ? Object.values(input.answerFieldLabels)
      .filter((value): value is string => typeof value === 'string')
      .map((label) => [label, resolveRegistrationFieldToken(label, input.answers, input.answerFieldLabels)] as const)
    : [];
  const normalized = normalizeEmailTemplateContent(kind, template.subject, template.body);
  const values = new Map<string, string>([
    ['NAME', input.name],
    ['EMAIL', input.email],
    ['EVENT_NAME', input.eventName],
    ...(kind === 'otp' ? [['CODE', input.ticketCode ?? ''] as const] : []),
    ...dynamicValues,
  ]);

  let subject = normalized.subject;
  let body = escapeHtml(normalized.body).replace(/\r?\n/g, '<br>');
  for (const [token, value] of values) {
    subject = subject.split(`[${token}]`).join(value);
    body = body.split(`[${token}]`).join(escapeHtml(value));
  }
  if (kind === 'ticket') {
    const ticketImage = `<img src="${escapeHtml(input.ticketImageUrl ?? '')}" alt="QR Code tiket" />`;
    body = body.split('[TICKET_IMAGE]').join(ticketImage);
  }

  return {
    subject: subject.replace(/[\r\n]+/g, ' ').trim(),
    htmlContent: `<div>${body}</div>`,
  };
}
