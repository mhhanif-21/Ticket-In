import { EventLifecycleError, normalizeEventStatus, type EventStatus } from '@/lib/events/eventLifecycle';
import { parsePosterAspectMode, type PosterAspectMode } from '@/lib/events/posterAspect';

const MAX_EVENT_NAME_LENGTH = 255;
const MAX_LOCATION_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_CAPACITY = 1_000_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class EventValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

export interface ValidatedEventInput {
  name: string;
  slug: string;
  capacity: number;
  registrationMode: 'Auto-Accept' | 'Manual Review';
  location: string;
  date: Date;
  description: string | null;
  posterAspectMode: PosterAspectMode;
  status?: EventStatus;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventValidationError('EVENT_PAYLOAD_INVALID', 'Payload acara harus berupa objek JSON.', 'body');
  }
  return value as Record<string, unknown>;
}

function trimRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new EventValidationError('EVENT_FIELD_REQUIRED', `${field} wajib diisi.`, field);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new EventValidationError('EVENT_FIELD_REQUIRED', `${field} wajib diisi.`, field);
  }
  if (normalized.length > maxLength) {
    throw new EventValidationError('EVENT_FIELD_TOO_LONG', `${field} maksimal ${maxLength} karakter.`, field);
  }
  return normalized;
}

function optionalTrimmedString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new EventValidationError('EVENT_FIELD_INVALID', `${field} harus berupa teks.`, field);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new EventValidationError('EVENT_FIELD_TOO_LONG', `${field} maksimal ${maxLength} karakter.`, field);
  }
  return normalized || null;
}

function parseCapacity(value: unknown): number {
  const candidate = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
  if (!Number.isSafeInteger(candidate) || (candidate as number) < 1 || (candidate as number) > MAX_CAPACITY) {
    throw new EventValidationError(
      'EVENT_CAPACITY_INVALID',
      `Kapasitas harus berupa bilangan bulat antara 1 dan ${MAX_CAPACITY}.`,
      'capacity',
    );
  }
  return candidate as number;
}

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EventValidationError('EVENT_DATE_INVALID', 'Tanggal acara tidak valid.', 'date');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EventValidationError('EVENT_DATE_INVALID', 'Tanggal acara tidak valid.', 'date');
  }
  return date;
}

export function generateEventSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function parseSlug(value: unknown, name: string): string {
  const slug = value === undefined ? generateEventSlug(name) : String(value).trim().toLowerCase();
  if (!slug || slug.length > 255 || !SLUG_PATTERN.test(slug)) {
    throw new EventValidationError(
      'EVENT_SLUG_INVALID',
      'Slug acara harus berupa huruf kecil, angka, dan tanda hubung yang valid.',
      'slug',
    );
  }
  return slug;
}

function parseRegistrationMode(value: unknown): 'Auto-Accept' | 'Manual Review' {
  if (value === undefined) return 'Auto-Accept';
  if (value === 'Auto-Accept' || value === 'Manual Review') return value;
  throw new EventValidationError('EVENT_REGISTRATION_MODE_INVALID', 'Mode pendaftaran tidak valid.', 'registration_mode');
}

function parsePosterAspect(value: unknown): PosterAspectMode {
  if (value === undefined) return 'landscape';
  try {
    return parsePosterAspectMode(value);
  } catch {
    throw new EventValidationError(
      'EVENT_POSTER_ASPECT_MODE_INVALID',
      'Format poster tidak valid. Pilih Portrait, Landscape, atau Banner.',
      'poster_aspect_mode',
    );
  }
}

const CREATE_KEYS = new Set(['name', 'slug', 'capacity', 'registration_mode', 'location', 'date', 'description', 'poster_aspect_mode']);
const UPDATE_KEYS = new Set([...CREATE_KEYS, 'status']);

function assertKnownKeys(payload: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new EventValidationError('EVENT_FIELD_UNKNOWN', `Field acara tidak dikenali: ${key}.`, key);
    }
  }
}

export function validateEventCreatePayload(value: unknown): ValidatedEventInput {
  const payload = asObject(value);
  assertKnownKeys(payload, CREATE_KEYS);
  const name = trimRequiredString(payload.name, 'name', MAX_EVENT_NAME_LENGTH);
  return {
    name,
    slug: parseSlug(payload.slug, name),
    capacity: parseCapacity(payload.capacity),
    registrationMode: parseRegistrationMode(payload.registration_mode),
    location: trimRequiredString(payload.location, 'location', MAX_LOCATION_LENGTH),
    date: parseDate(payload.date),
    description: optionalTrimmedString(payload.description, 'description', MAX_DESCRIPTION_LENGTH),
    posterAspectMode: parsePosterAspect(payload.poster_aspect_mode),
  };
}

export function validateEventUpdatePayload(value: unknown): Partial<ValidatedEventInput> {
  const payload = asObject(value);
  assertKnownKeys(payload, UPDATE_KEYS);
  if (Object.keys(payload).length === 0) {
    throw new EventValidationError('EVENT_PAYLOAD_EMPTY', 'Tidak ada perubahan acara untuk disimpan.', 'body');
  }

  const update: Partial<ValidatedEventInput> = {};
  const normalizedName = payload.name === undefined
    ? undefined
    : trimRequiredString(payload.name, 'name', MAX_EVENT_NAME_LENGTH);
  if (normalizedName !== undefined) update.name = normalizedName;
  if (payload.slug !== undefined) update.slug = parseSlug(payload.slug, normalizedName ?? 'event');
  if (payload.capacity !== undefined) update.capacity = parseCapacity(payload.capacity);
  if (payload.registration_mode !== undefined) update.registrationMode = parseRegistrationMode(payload.registration_mode);
  if (payload.location !== undefined) update.location = trimRequiredString(payload.location, 'location', MAX_LOCATION_LENGTH);
  if (payload.date !== undefined) update.date = parseDate(payload.date);
  if (payload.description !== undefined) update.description = optionalTrimmedString(payload.description, 'description', MAX_DESCRIPTION_LENGTH);
  if (payload.poster_aspect_mode !== undefined) update.posterAspectMode = parsePosterAspect(payload.poster_aspect_mode);
  if (payload.status !== undefined) {
    try {
      update.status = normalizeEventStatus(payload.status);
    } catch (error) {
      if (error instanceof EventLifecycleError) {
        throw new EventValidationError('EVENT_STATUS_INVALID', error.message, 'status');
      }
      throw error;
    }
  }
  return update;
}
