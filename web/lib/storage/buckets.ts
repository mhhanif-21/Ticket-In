/**
 * Canonical Supabase Storage bucket names used by the application.
 * Keep these values aligned with the storage migration.
 */
export const STORAGE_BUCKETS = {
  eventPosters: 'event_posters',
  ticketTemplates: 'ticket_templates',
  participantFiles: 'participant_files',
  tickets: 'tickets',
} as const;

export type StorageBucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
