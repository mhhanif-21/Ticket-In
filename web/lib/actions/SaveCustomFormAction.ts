import { db } from '@/db';
import { formFields, events } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type AllowedFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'radio' | 'file' | 'email' | 'textarea' | 'image';

export interface FormFieldPayload {
  field_name?: unknown;
  field_type?: unknown;
  is_required?: unknown;
  options?: unknown;
  order?: unknown;
  fieldName?: unknown;
  fieldType?: unknown;
  isRequired?: unknown;
}

interface NormalizedFormFieldPayload {
  fieldName: string;
  fieldType: AllowedFieldType;
  isRequired: boolean;
  options: any | null;
  order: number;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

export class SaveCustomFormAction {
  static readonly MAX_FIELDS = 25;
  // [BUG-057] FIX: Tambah 'radio' ke ALLOWED_TYPES — Flutter kirim 'radio' untuk Pilihan Ganda (single-select)
  // 'radio' ≠ 'checkbox': radio = pilih satu, checkbox = pilih banyak
  static readonly ALLOWED_TYPES = ['text', 'number', 'select', 'checkbox', 'radio', 'file', 'email', 'textarea', 'image'];

  static normalizeFields(fields: FormFieldPayload[]): NormalizedFormFieldPayload[] {
    const normalizedFields = fields.map((field, index) => {
      const fieldName = firstDefined(field.field_name, field.fieldName);
      const fieldType = firstDefined(field.field_type, field.fieldType);
      const required = firstDefined(field.is_required, field.isRequired, false);
      const rawOrder = firstDefined(field.order, index);

      if (typeof fieldName !== 'string' || fieldName.trim() === '') {
        throw new Error('Nama field tidak boleh kosong');
      }
      if (typeof fieldType !== 'string' || !this.ALLOWED_TYPES.includes(fieldType)) {
        throw new Error(`Tipe field tidak diizinkan: ${String(fieldType)}`);
      }
      if (typeof required !== 'boolean') {
        throw new Error(`Status wajib field ${fieldName} tidak valid`);
      }
      if (typeof rawOrder !== 'number' || !Number.isInteger(rawOrder) || rawOrder < 0) {
        throw new Error(`Urutan field ${fieldName} tidak valid`);
      }

      return {
        fieldName: fieldName.trim(),
        fieldType: fieldType as AllowedFieldType,
        isRequired: required,
        options: firstDefined(field.options, null),
        order: rawOrder,
      };
    });

    const orders = new Set(normalizedFields.map((field) => field.order));
    if (orders.size !== normalizedFields.length) {
      throw new Error('Urutan field harus unik');
    }

    return normalizedFields;
  }

  static async execute(eventId: string, fields: FormFieldPayload[]) {
    const normalizedFields = this.normalizeFields(fields);

    // 1. Validate max fields (TDS-004)
    if (normalizedFields.length > this.MAX_FIELDS) {
      throw new Error(`Maksimal ${this.MAX_FIELDS} field yang diizinkan (TDS-004)`);
    }

    // 2. Validate field types
    for (const field of normalizedFields) {
      if (!this.ALLOWED_TYPES.includes(field.fieldType)) {
        throw new Error(`Tipe field tidak diizinkan: ${field.fieldType}`);
      }
      if (!field.fieldName || field.fieldName.trim() === '') {
        throw new Error('Nama field tidak boleh kosong');
      }
      if (['radio', 'checkbox', 'select'].includes(field.fieldType)) {
        if (!Array.isArray(field.options) || field.options.length === 0 || field.options.some((option) => typeof option !== 'string' || option.trim() === '')) {
          throw new Error(`Field ${field.fieldName} memerlukan minimal satu pilihan yang valid`);
        }
      }
    }

    // 3. Verify event exists
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) {
      throw new Error('Event tidak ditemukan');
    }

    // 4. Perform replace semantics (transaction)
    await db.transaction(async (tx) => {
      // Delete old fields
      await tx.delete(formFields).where(eq(formFields.eventId, eventId));

      // Insert new fields if any
      if (normalizedFields.length > 0) {
        const insertPayload = normalizedFields.map(f => ({
          eventId,
          fieldName: f.fieldName,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          options: f.options,
          order: f.order,
        }));
        await tx.insert(formFields).values(insertPayload);
      }
    });

    return true;
  }
}
