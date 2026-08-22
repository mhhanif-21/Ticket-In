export const EVENT_STATUSES = ['Draft', 'Published', 'Cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export class EventLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventLifecycleError';
  }
}

/**
 * Active was the pre-persistence API spelling. Keep it as an input alias so
 * existing admin clients do not silently write an invalid database value.
 */
export function normalizeEventStatus(value: unknown): EventStatus {
  if (value === 'Active') return 'Published';
  if (typeof value === 'string' && EVENT_STATUSES.includes(value as EventStatus)) {
    return value as EventStatus;
  }
  throw new EventLifecycleError('Status acara tidak valid');
}

export function isPublicEventStatus(status: unknown): status is 'Published' {
  return status === 'Published';
}

/**
 * A cancelled event is terminal. Draft events can be published or cancelled;
 * published events can only be cancelled.
 */
export function canTransitionEventStatus(current: unknown, next: EventStatus): boolean {
  const normalizedCurrent = normalizeEventStatus(current);
  if (normalizedCurrent === next) return true;
  if (normalizedCurrent === 'Draft') return next === 'Published' || next === 'Cancelled';
  if (normalizedCurrent === 'Published') return next === 'Cancelled';
  return false;
}

export function assertEventIsPublic(status: unknown): void {
  if (!isPublicEventStatus(status)) {
    throw new EventLifecycleError('Event belum dipublikasikan atau sudah dibatalkan');
  }
}
