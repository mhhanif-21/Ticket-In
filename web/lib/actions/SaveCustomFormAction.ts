import { randomUUID } from 'node:crypto';

import { db } from '@/db';
import { events, formFields, registrations } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export type AllowedFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'radio' | 'file' | 'email' | 'textarea' | 'image';
type FormFieldKind = 'custom' | 'static_name' | 'static_email';

export interface FormFieldPayload {
  id?: unknown;
  field_id?: unknown;
  field_key?: unknown;
  field_kind?: unknown;
  field_name?: unknown;
  field_type?: unknown;
  is_required?: unknown;
  options?: unknown;
  order?: unknown;
  fieldKey?: unknown;
  fieldKind?: unknown;
  fieldName?: unknown;
  fieldType?: unknown;
  isRequired?: unknown;
}

interface NormalizedFormFieldPayload {
  id?: string;
  fieldKey?: string;
  fieldKind: FormFieldKind;
  fieldName: string;
  fieldType: AllowedFieldType;
  isRequired: boolean;
  options: string[] | null;
  order: number;
}

interface PersistedFormField {
  id: string;
  fieldKey: string;
  fieldKind: FormFieldKind;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  options: unknown;
  order: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

function normalizeComparableLabel(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function staticKindForLabel(value: string): FormFieldKind | null {
  const label = normalizeComparableLabel(value);
  if (label === 'nama') return 'static_name';
  if (label === 'email') return 'static_email';
  return null;
}

function canonicalStaticField(kind: Exclude<FormFieldKind, 'custom'>): Pick<NormalizedFormFieldPayload, 'fieldName' | 'fieldType' | 'isRequired' | 'options'> {
  return kind === 'static_name'
    ? { fieldName: 'Nama', fieldType: 'text', isRequired: true, options: null }
    : { fieldName: 'Email', fieldType: 'email', isRequired: true, options: null };
}

function optionsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function hasSameDefinition(existing: PersistedFormField, incoming: NormalizedFormFieldPayload): boolean {
  return existing.fieldKind === incoming.fieldKind
    && existing.fieldName === incoming.fieldName
    && existing.fieldType === incoming.fieldType
    && existing.isRequired === incoming.isRequired
    && optionsEqual(existing.options, incoming.options);
}

export class SaveCustomFormAction {
  static readonly MAX_FIELDS = 25;
  static readonly ALLOWED_TYPES: AllowedFieldType[] = ['text', 'number', 'select', 'checkbox', 'radio', 'file', 'email', 'textarea', 'image'];

  static normalizeFields(fields: FormFieldPayload[]): NormalizedFormFieldPayload[] {
    if (fields.length > this.MAX_FIELDS) {
      throw new Error(`Maksimal ${this.MAX_FIELDS} field yang diizinkan (TDS-004)`);
    }

    const normalizedFields = fields.map((field, index) => {
      const rawName = firstDefined(field.field_name, field.fieldName);
      const rawType = firstDefined(field.field_type, field.fieldType);
      const rawRequired = firstDefined(field.is_required, field.isRequired, false);
      const rawOrder = firstDefined(field.order, index);
      const rawId = firstDefined(field.id, field.field_id);
      const rawKey = firstDefined(field.field_key, field.fieldKey);
      const rawKind = firstDefined(field.field_kind, field.fieldKind);

      if (typeof rawName !== 'string' || rawName.trim() === '') {
        throw new Error('Nama field tidak boleh kosong');
      }
      const submittedName = rawName.trim();
      if (submittedName.length > 255) {
        throw new Error('Nama field maksimal 255 karakter');
      }
      if (typeof rawType !== 'string' || !this.ALLOWED_TYPES.includes(rawType as AllowedFieldType)) {
        throw new Error(`Tipe field tidak diizinkan: ${String(rawType)}`);
      }
      if (typeof rawRequired !== 'boolean') {
        throw new Error(`Status wajib field ${submittedName} tidak valid`);
      }
      if (typeof rawOrder !== 'number' || !Number.isInteger(rawOrder) || rawOrder < 0) {
        throw new Error(`Urutan field ${submittedName} tidak valid`);
      }
      if (rawId !== undefined && (typeof rawId !== 'string' || !UUID_PATTERN.test(rawId))) {
        throw new Error(`ID field ${submittedName} tidak valid`);
      }
      if (rawKey !== undefined && (typeof rawKey !== 'string' || !/^field_[0-9a-f-]{36}$/i.test(rawKey))) {
        throw new Error(`Key field ${submittedName} tidak valid`);
      }

      const inferredStaticKind = staticKindForLabel(submittedName);
      if (rawKind !== undefined && rawKind !== 'custom' && rawKind !== 'static_name' && rawKind !== 'static_email') {
        throw new Error(`Jenis field ${submittedName} tidak valid`);
      }
      if (rawKind === 'custom' && inferredStaticKind) {
        throw new Error(`Field ${inferredStaticKind === 'static_name' ? 'Nama' : 'Email'} adalah field sistem dan tidak dapat dibuat sebagai field kustom`);
      }
      if (rawKind && rawKind !== 'custom' && rawKind !== inferredStaticKind) {
        throw new Error(`Jenis field sistem untuk ${submittedName} tidak valid`);
      }

      const fieldKind = inferredStaticKind ?? 'custom';
      const rawOptions = firstDefined(field.options, null);
      let options: string[] | null = null;
      if (['radio', 'checkbox', 'select'].includes(rawType)) {
        if (!Array.isArray(rawOptions) || rawOptions.length === 0 || rawOptions.some((option) => typeof option !== 'string' || option.trim() === '')) {
          throw new Error(`Field ${submittedName} memerlukan minimal satu pilihan yang valid`);
        }
        options = rawOptions.map((option) => (option as string).trim());
        if (new Set(options).size !== options.length) {
          throw new Error(`Pilihan pada field ${submittedName} harus unik`);
        }
      } else if (rawOptions !== null && rawOptions !== undefined) {
        throw new Error(`Field ${submittedName} tidak menerima opsi pilihan`);
      }

      const normalized: NormalizedFormFieldPayload = {
        id: rawId as string | undefined,
        fieldKey: rawKey as string | undefined,
        fieldKind,
        fieldName: submittedName,
        fieldType: rawType as AllowedFieldType,
        isRequired: rawRequired,
        options,
        order: rawOrder,
      };

      return fieldKind === 'custom'
        ? normalized
        : { ...normalized, ...canonicalStaticField(fieldKind) };
    });

    const orders = new Set(normalizedFields.map((field) => field.order));
    if (orders.size !== normalizedFields.length) {
      throw new Error('Urutan field harus unik');
    }

    const fieldKinds = normalizedFields.filter((field) => field.fieldKind !== 'custom').map((field) => field.fieldKind);
    if (new Set(fieldKinds).size !== fieldKinds.length) {
      throw new Error('Field sistem Nama dan Email tidak boleh diduplikasi');
    }

    const customLabels = normalizedFields
      .filter((field) => field.fieldKind === 'custom')
      .map((field) => normalizeComparableLabel(field.fieldName));
    if (new Set(customLabels).size !== customLabels.length) {
      throw new Error('Nama field kustom tidak boleh duplikat');
    }

    return normalizedFields;
  }

  static async execute(eventId: string, fields: FormFieldPayload[]) {
    const normalizedFields = this.normalizeFields(fields);

    return db.transaction(async (tx) => {
      const [event] = await tx
        .select({ id: events.id, formVersion: events.formVersion })
        .from(events)
        .where(eq(events.id, eventId))
        .for('update')
        .limit(1);
      if (!event) throw new Error('Event tidak ditemukan');

      const existingFields = await tx
        .select({
          id: formFields.id,
          fieldKey: formFields.fieldKey,
          fieldKind: formFields.fieldKind,
          fieldName: formFields.fieldName,
          fieldType: formFields.fieldType,
          isRequired: formFields.isRequired,
          options: formFields.options,
          order: formFields.order,
        })
        .from(formFields)
        .where(eq(formFields.eventId, eventId)) as PersistedFormField[];

      const [registration] = await tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(eq(registrations.eventId, eventId))
        .limit(1);
      const hasRegistrationHistory = Boolean(registration);

      const byId = new Map(existingFields.map((field) => [field.id, field]));
      const byKey = new Map(existingFields.map((field) => [field.fieldKey, field]));
      const customByLabel = new Map(
        existingFields
          .filter((field) => field.fieldKind === 'custom')
          .map((field) => [normalizeComparableLabel(field.fieldName), field]),
      );
      const staticByKind = new Map(
        existingFields
          .filter((field) => field.fieldKind !== 'custom')
          .map((field) => [field.fieldKind, field]),
      );

      const retainedIds = new Set<string>();
      let changed = false;

      for (const field of normalizedFields) {
        let existing: PersistedFormField | undefined;
        if (field.id) existing = byId.get(field.id);
        if (!existing && field.fieldKey) existing = byKey.get(field.fieldKey);
        if (!existing && !field.id && !field.fieldKey) {
          existing = field.fieldKind === 'custom'
            ? customByLabel.get(normalizeComparableLabel(field.fieldName))
            : staticByKind.get(field.fieldKind);
        }

        if ((field.id || field.fieldKey) && !existing) {
          throw new Error(`Field ${field.fieldName} tidak ditemukan pada event ini`);
        }

        if (existing) {
          retainedIds.add(existing.id);
          if (hasRegistrationHistory && !hasSameDefinition(existing, field)) {
            throw new Error(`Field ${existing.fieldName} tidak dapat diubah setelah pendaftaran tersedia. Tambahkan field baru bila diperlukan.`);
          }
          if (!hasSameDefinition(existing, field) || existing.order !== field.order) {
            changed = true;
            await tx.update(formFields)
              .set({
                fieldName: field.fieldName,
                fieldType: field.fieldType,
                isRequired: field.isRequired,
                options: field.options,
                order: field.order,
                fieldKind: field.fieldKind,
              })
              .where(eq(formFields.id, existing.id));
          }
          continue;
        }

        const id = randomUUID();
        const fieldKey = `field_${id}`;
        retainedIds.add(id);
        changed = true;
        await tx.insert(formFields).values({
          id,
          eventId,
          fieldKey,
          fieldKind: field.fieldKind,
          fieldName: field.fieldName,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          options: field.options,
          order: field.order,
        });
      }

      for (const existing of existingFields) {
        if (existing.fieldKind !== 'custom' || retainedIds.has(existing.id)) continue;
        if (hasRegistrationHistory) {
          throw new Error(`Field ${existing.fieldName} tidak dapat dihapus setelah pendaftaran tersedia.`);
        }
        changed = true;
        await tx.delete(formFields).where(eq(formFields.id, existing.id));
      }

      if (changed) {
        await tx.update(events)
          .set({ formVersion: sql`${events.formVersion} + 1`, updatedAt: new Date() })
          .where(eq(events.id, eventId));
      }

      return { formVersion: event.formVersion + (changed ? 1 : 0) };
    });
  }
}
