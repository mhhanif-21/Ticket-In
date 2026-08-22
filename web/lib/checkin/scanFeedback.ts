export type ScanFeedbackStatus = 'success' | 'duplicate' | 'invalid';

export const SCAN_FEEDBACK_DISMISS_MS: Record<ScanFeedbackStatus, number> = {
  success: 2_000,
  duplicate: 15_000,
  invalid: 15_000,
};

export function getScanFeedbackDismissMs(status: ScanFeedbackStatus): number {
  return SCAN_FEEDBACK_DISMISS_MS[status];
}
