export interface RegistrationResubmitState {
  registrationId: string;
  resubmitToken: string;
  statusToken: string;
  statusTokenExpiresAt: string;
  name: string;
  email: string;
  answers: Record<string, string | string[]>;
}

function storageKey(slug: string): string {
  return `ticketin:registration-resubmit:${slug}`;
}

function isStringRecord(value: unknown): value is Record<string, string | string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string' || (Array.isArray(item) && item.every((entry) => typeof entry === 'string')));
}

function isValidState(value: unknown): value is RegistrationResubmitState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<RegistrationResubmitState>;
  return typeof candidate.registrationId === 'string'
    && Boolean(candidate.registrationId)
    && typeof candidate.resubmitToken === 'string'
    && Boolean(candidate.resubmitToken)
    && typeof candidate.statusToken === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.statusToken)
    && typeof candidate.statusTokenExpiresAt === 'string'
    && !Number.isNaN(new Date(candidate.statusTokenExpiresAt).getTime())
    && typeof candidate.name === 'string'
    && typeof candidate.email === 'string'
    && isStringRecord(candidate.answers);
}

export function saveRegistrationResubmitState(slug: string, state: RegistrationResubmitState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    // Private browsing or a full storage quota must not break registration.
  }
}

export function loadRegistrationResubmitState(slug: string): RegistrationResubmitState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRegistrationResubmitState(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(slug));
  } catch {
    // Ignore unavailable storage during cleanup.
  }
}
