export const STANDARD_EXPORT_HEADERS = [
  'ID',
  'Name',
  'Email',
  'Status',
  'Ticket Code',
  'Presence',
  'Registered At',
] as const;

export interface ExportFieldDefinition {
  id: string;
  fieldName: string;
  order: number;
}

export interface ExportRegistrationRecord {
  id: string;
  name: string;
  email: string;
  status: string;
  ticketCode: string | null;
  presenceStatus: string;
  createdAt: Date;
  answers: unknown;
  answerFieldLabels: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_FIELD_PATTERN = /^field_(.+)$/i;

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, label]) => typeof label === 'string' && label.trim() !== '')
      .map(([key, label]) => [key, (label as string).trim()]),
  );
}

function isSafeHumanLabel(label: string): boolean {
  // A corrupted/legacy snapshot must not reintroduce persistence UUIDs into a
  // user-facing CSV header.
  return !(INTERNAL_FIELD_PATTERN.test(label) && (
    /^field_\d+$/i.test(label)
    || UUID_PATTERN.test(label.slice('field_'.length))
  ));
}

function fallbackLabel(index: number): string {
  return `Custom Field ${index}`;
}

export function resolveExportFieldLabel(
  key: string,
  answerFieldLabels: unknown,
  definitions: ExportFieldDefinition[],
  fallbackIndex = 1,
): string {
  const snapshot = asStringRecord(answerFieldLabels);
  const snapshotted = snapshot[key];
  if (snapshotted && isSafeHumanLabel(snapshotted)) return snapshotted;

  const byId = new Map(definitions.map((field) => [field.id, field]));
  const byOrder = new Map(definitions.map((field) => [field.order, field]));
  const internalKey = INTERNAL_FIELD_PATTERN.exec(key);

  if (internalKey) {
    const rawIdentifier = internalKey[1];
    const numericOrder = /^\d+$/.test(rawIdentifier) ? Number(rawIdentifier) : null;
    const definition = numericOrder !== null
      ? byOrder.get(numericOrder)
      : byId.get(rawIdentifier) || (UUID_PATTERN.test(rawIdentifier) ? byId.get(rawIdentifier) : undefined);
    if (definition?.fieldName?.trim()) return definition.fieldName.trim();
    return fallbackLabel(fallbackIndex);
  }

  // Legacy exports sometimes stored the raw form-field UUID without the
  // field_ prefix. Resolve it when possible, otherwise never expose it.
  if (UUID_PATTERN.test(key)) {
    return byId.get(key)?.fieldName?.trim() || fallbackLabel(fallbackIndex);
  }

  // Older records used the human label itself as the answer key.
  return key.trim() || fallbackLabel(fallbackIndex);
}

export function buildExportRow(
  registration: ExportRegistrationRecord,
  definitions: ExportFieldDefinition[],
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ID: registration.id,
    Name: registration.name,
    Email: registration.email,
    Status: registration.status,
    'Ticket Code': registration.ticketCode,
    Presence: registration.presenceStatus,
    'Registered At': registration.createdAt.toISOString(),
  };

  const customAnswers: Record<string, unknown> = {};
  if (registration.answers && typeof registration.answers === 'object' && !Array.isArray(registration.answers)) {
    let fallbackIndex = 1;
    for (const [key, value] of Object.entries(registration.answers as Record<string, unknown>)) {
      const label = resolveExportFieldLabel(key, registration.answerFieldLabels, definitions, fallbackIndex);
      let header = `Custom: ${label}`;
      let collision = 2;
      while (Object.prototype.hasOwnProperty.call(customAnswers, header)) {
        header = `Custom: ${label} (${collision++})`;
      }
      customAnswers[header] = value;
      fallbackIndex += 1;
    }
  }

  return { ...base, ...customAnswers };
}

export function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
  return JSON.stringify(neutralizeCsvFormula(normalized));
}

export function getCsvHeaders(data: Record<string, unknown>[]): string[] {
  const customHeaders = Array.from(new Set(
    data.flatMap((row) => Object.keys(row).filter((header) => !STANDARD_EXPORT_HEADERS.includes(header as (typeof STANDARD_EXPORT_HEADERS)[number]))),
  )).sort((left, right) => left.localeCompare(right));
  return [...STANDARD_EXPORT_HEADERS, ...customHeaders];
}

export function csvRow(headers: readonly string[], row: Record<string, unknown>): string {
  return headers.map((header) => csvCell(row[header])).join(',');
}

export function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = getCsvHeaders(data);
  const rows = data.map((row) => csvRow(headers, row));
  return [headers.map(csvCell).join(','), ...rows].join('\n');
}
