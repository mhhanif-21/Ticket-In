import { db } from '@/db';
import { formFields, events } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type AllowedFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'radio' | 'file' | 'email' | 'textarea' | 'image';

export interface FormFieldPayload {
  field_name: string;
  field_type: AllowedFieldType;
  is_required: boolean;
  options: any | null;
  order: number;
}

interface NormalizedFormFieldPayload {
  fieldName: string;
  fieldType: AllowedFieldType;
  isRequired: boolean;
  options: any | null;
  order: number;
}

export class SaveCustomFormAction {
  static readonly MAX_FIELDS = 25;
  // [BUG-057] FIX: Tambah 'radio' ke ALLOWED_TYPES — Flutter kirim 'radio' untuk Pilihan Ganda (single-select)
  // 'radio' ≠ 'checkbox': radio = pilih satu, checkbox = pilih banyak
  static readonly ALLOWED_TYPES = ['text', 'number', 'select', 'checkbox', 'radio', 'file', 'email', 'textarea', 'image'];

  static async execute(eventId: string, fields: FormFieldPayload[]) {
    const normalizedFields: NormalizedFormFieldPayload[] = fields.map((field) => ({
      fieldName: field.field_name,
      fieldType: field.field_type,
      isRequired: field.is_required,
      options: field.options,
      order: field.order,
    }));

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
