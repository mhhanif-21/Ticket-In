export const CHOICE_FIELD_TYPES = ['radio', 'checkbox', 'select'] as const;
export type ChoiceFieldType = (typeof CHOICE_FIELD_TYPES)[number];

export interface RegistrationFormField {
  id: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  options: unknown;
}

export class RegistrationFormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationFormValidationError';
  }
}

function isChoiceFieldType(fieldType: string): fieldType is ChoiceFieldType {
  return CHOICE_FIELD_TYPES.includes(fieldType as ChoiceFieldType);
}

function optionsFor(field: RegistrationFormField): string[] {
  if (!Array.isArray(field.options) || field.options.length === 0 || field.options.some((option) => typeof option !== 'string' || option.trim() === '')) {
    throw new RegistrationFormValidationError(`Konfigurasi pilihan tidak valid untuk field ${field.fieldName}`);
  }

  return field.options;
}

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === 'string') return value.trim() !== '';
  if (value instanceof Blob) return value.size > 0;
  if (value && typeof value === 'object') return true;
  return false;
}

function isStoredFileAnswer(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'path' in value);
}

export function validateRegistrationAnswers(fields: RegistrationFormField[], answers: Record<string, unknown>) {
  const fieldsByKey = new Map(fields.map((field) => [`field_${field.id}`, field]));

  for (const key of Object.keys(answers)) {
    if (!fieldsByKey.has(key)) {
      throw new RegistrationFormValidationError(`Field pendaftaran tidak dikenal: ${key}`);
    }
  }

  for (const field of fields) {
    const key = `field_${field.id}`;
    const value = answers[key];

    if (!hasValue(value)) {
      if (field.isRequired) {
        throw new RegistrationFormValidationError(`Field wajib diisi: ${field.fieldName}`);
      }
      continue;
    }

    if (field.fieldType === 'file' || field.fieldType === 'image') {
      if (!(value instanceof Blob) && !isStoredFileAnswer(value)) {
        throw new RegistrationFormValidationError(`Field ${field.fieldName} harus berupa berkas`);
      }
      continue;
    }

    if (field.fieldType === 'number') {
      if (typeof value !== 'string' || !Number.isFinite(Number(value))) {
        throw new RegistrationFormValidationError(`Field ${field.fieldName} harus berupa angka`);
      }
      continue;
    }

    if (isChoiceFieldType(field.fieldType)) {
      const options = optionsFor(field);
      const values = field.fieldType === 'checkbox' ? value : [value];
      if (!Array.isArray(values) || values.length === 0 || values.some((answer) => typeof answer !== 'string' || !options.includes(answer))) {
        throw new RegistrationFormValidationError(`Pilihan tidak valid untuk field ${field.fieldName}`);
      }
      if (field.fieldType !== 'checkbox' && values.length !== 1) {
        throw new RegistrationFormValidationError(`Field ${field.fieldName} hanya menerima satu pilihan`);
      }
      continue;
    }

    if (typeof value !== 'string') {
      throw new RegistrationFormValidationError(`Nilai tidak valid untuk field ${field.fieldName}`);
    }
  }
}
