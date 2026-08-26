import { eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventApprovalEmailTemplates,
  eventTicketTemplates,
} from '@/db/schema';

export const TICKET_TEMPLATE_MAX_FILE_BYTES = 5 * 1024 * 1024;

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
      | 'EMAIL_TEMPLATE_TOKEN_INVALID',
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

    const element: TicketTemplateElement = {
      type: item.type,
      token: typeof item.token === 'string' ? item.token.trim() : undefined,
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
  const isJpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const isPng = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    throw new TicketTemplateValidationError(
      'TICKET_TEMPLATE_BACKGROUND_TYPE_NOT_ALLOWED',
      415,
      'Format gambar template tidak didukung. Gunakan JPG, PNG, atau WebP.',
    );
  }

  return {
    bytes,
    mimeType: isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp',
  };
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

export async function getActiveApprovalEmailTemplate(eventId: string) {
  const [template] = await db
    .select({
      isActive: eventApprovalEmailTemplates.isActive,
      subject: eventApprovalEmailTemplates.subject,
      body: eventApprovalEmailTemplates.body,
    })
    .from(eventApprovalEmailTemplates)
    .where(eq(eventApprovalEmailTemplates.eventId, eventId))
    .limit(1);

  return template?.isActive ? template : null;
}

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

type ApprovalEmailTemplate = { subject: string; body: string };

export function validateApprovalEmailTemplateTokens(
  subject: string,
  body: string,
  allowedFieldLabels: string[],
): void {
  const allowed = new Set(['NAME', 'EMAIL', 'EVENT_NAME', 'CODE', 'TICKET_IMAGE', ...allowedFieldLabels]);
  const tokens = `${subject}\n${body}`.match(/\[([^\]\r\n]{1,80})\]/g) ?? [];
  const invalid = subject.includes('[TICKET_IMAGE]')
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
    ticketCode: string;
    ticketImageUrl: string;
    answers: unknown;
    answerFieldLabels: unknown;
  },
): { subject: string; htmlContent: string } {
  const dynamicValues = isRecord(input.answerFieldLabels)
    ? Object.values(input.answerFieldLabels)
      .filter((value): value is string => typeof value === 'string')
      .map((label) => [label, resolveRegistrationFieldToken(label, input.answers, input.answerFieldLabels)] as const)
    : [];
  const values = new Map<string, string>([
    ['NAME', input.name],
    ['EMAIL', input.email],
    ['EVENT_NAME', input.eventName],
    ['CODE', input.ticketCode],
    ...dynamicValues,
  ]);

  let subject = template.subject;
  let body = escapeHtml(template.body).replace(/\r?\n/g, '<br>');
  for (const [token, value] of values) {
    subject = subject.split(`[${token}]`).join(value);
    body = body.split(`[${token}]`).join(escapeHtml(value));
  }
  const ticketImage = `<img src="${escapeHtml(input.ticketImageUrl)}" alt="QR Code tiket" />`;
  body = body.split('[TICKET_IMAGE]').join(ticketImage);

  return {
    subject: subject.replace(/[\r\n]+/g, ' ').trim(),
    htmlContent: `<div>${body}</div>`,
  };
}
