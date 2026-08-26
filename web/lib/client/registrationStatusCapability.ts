export interface RegistrationStatusCapabilityState {
  token: string;
  expiresAt: string;
}

function storageKey(slug: string): string {
  return `ticketin:registration-status-capability:${slug}`;
}

function isValidState(value: unknown): value is RegistrationStatusCapabilityState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<RegistrationStatusCapabilityState>;
  return typeof candidate.token === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.token)
    && typeof candidate.expiresAt === 'string'
    && !Number.isNaN(new Date(candidate.expiresAt).getTime());
}

export function saveRegistrationStatusCapability(
  slug: string,
  state: RegistrationStatusCapabilityState,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    // Private browsing or storage quota must not break a completed registration.
  }
}

export function loadRegistrationStatusCapability(slug: string): RegistrationStatusCapabilityState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed) || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(storageKey(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRegistrationStatusCapability(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(slug));
  } catch {
    // Ignore unavailable storage during cleanup.
  }
}
