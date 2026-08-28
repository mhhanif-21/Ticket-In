export const PARTICIPANT_FILE_MAX_BYTES = 5 * 1024 * 1024;

export type ParticipantFileMime = 'image/jpeg' | 'image/png' | 'application/pdf';

export class ParticipantFileValidationError extends Error {
  constructor(
    public readonly code: 'REGISTRATION_FILE_TOO_LARGE' | 'REGISTRATION_FILE_TYPE_NOT_ALLOWED',
    public readonly status: 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = 'ParticipantFileValidationError';
  }
}

export function detectParticipantFileMime(bytes: Uint8Array): ParticipantFileMime | null {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return 'image/jpeg';

  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (isPng) return 'image/png';

  const isPdf = bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (isPdf) return 'application/pdf';

  return null;
}

function normalizedDeclaredMime(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isDeclaredMimeCompatible(declaredMime: string, detectedMime: ParticipantFileMime): boolean {
  if (declaredMime === '') return true;
  if (detectedMime === 'image/jpeg') return declaredMime === 'image/jpeg' || declaredMime === 'image/jpg';
  return declaredMime === detectedMime;
}

function allowedFormatLabel(fieldType: string): string {
  return fieldType === 'file' ? 'PDF' : 'JPG atau PNG';
}

export function validateParticipantFileMetadata(input: {
  fileName: string;
  size: number;
  declaredMime?: string;
  fieldType: string;
}): void {
  if (input.size > PARTICIPANT_FILE_MAX_BYTES) {
    throw new ParticipantFileValidationError(
      'REGISTRATION_FILE_TOO_LARGE',
      413,
      `Ukuran ${input.fileName} melebihi batas 5 MB.`,
    );
  }

  const declaredMime = normalizedDeclaredMime(input.declaredMime);
  const allowedDeclaredMimes = input.fieldType === 'image'
    ? new Set(['', 'image/jpeg', 'image/jpg', 'image/png'])
    : new Set(['', 'application/pdf']);
  if (!allowedDeclaredMimes.has(declaredMime)) {
    throw new ParticipantFileValidationError(
      'REGISTRATION_FILE_TYPE_NOT_ALLOWED',
      415,
      `Format ${input.fileName} tidak didukung. Gunakan ${allowedFormatLabel(input.fieldType)}.`,
    );
  }
}

export function validateParticipantFileContent(input: {
  fileName: string;
  declaredMime?: string;
  fieldType: string;
  bytes: Uint8Array;
}): ParticipantFileMime {
  const detectedMime = detectParticipantFileMime(input.bytes);
  const isAllowedForField = input.fieldType === 'image'
    ? detectedMime === 'image/jpeg' || detectedMime === 'image/png'
    : detectedMime === 'application/pdf';
  if (!detectedMime || !isAllowedForField || !isDeclaredMimeCompatible(normalizedDeclaredMime(input.declaredMime), detectedMime)) {
    throw new ParticipantFileValidationError(
      'REGISTRATION_FILE_TYPE_NOT_ALLOWED',
      415,
      `Format ${input.fileName} tidak didukung. Gunakan ${allowedFormatLabel(input.fieldType)}.`,
    );
  }
  return detectedMime;
}

export async function validateParticipantFile(input: {
  file: Blob & { name?: string; type?: string };
  fieldType: string;
}): Promise<ParticipantFileMime> {
  const fileName = input.file.name?.trim() || 'Berkas';
  validateParticipantFileMetadata({
    fileName,
    size: input.file.size,
    declaredMime: input.file.type,
    fieldType: input.fieldType,
  });
  const bytes = new Uint8Array(await input.file.slice(0, 16).arrayBuffer());
  return validateParticipantFileContent({
    fileName,
    declaredMime: input.file.type,
    fieldType: input.fieldType,
    bytes,
  });
}
