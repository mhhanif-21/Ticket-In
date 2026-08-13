import { db } from '@/db';
import { formFields, events } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type AllowedFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'file' | 'email' | 'textarea' | 'image';

export interface FormFieldPayload {
  fieldName: string;
  fieldType: AllowedFieldType;
  isRequired: boolean;
  options: any | null;
  order: number;
}

export class SaveCustomFormAction {
  static readonly MAX_FIELDS = 25;
  static readonly ALLOWED_TYPES = ['text', 'number', 'select', 'checkbox', 'file', 'email', 'textarea', 'image'];

  static async execute(eventId: string, fields: FormFieldPayload[]) {
    // 1. Validate max fields (TDS-004)
    if (fields.length > this.MAX_FIELDS) {
      throw new Error(`Maksimal ${this.MAX_FIELDS} field yang diizinkan (TDS-004)`);
    }

    // 2. Validate field types
    for (const field of fields) {
      if (!this.ALLOWED_TYPES.includes(field.fieldType)) {
        throw new Error(`Tipe field tidak diizinkan: ${field.fieldType}`);
      }
      if (!field.fieldName || field.fieldName.trim() === '') {
        throw new Error('Nama field tidak boleh kosong');
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
      if (fields.length > 0) {
        const insertPayload = fields.map(f => ({
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
