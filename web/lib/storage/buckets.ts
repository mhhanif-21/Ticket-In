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

// Exports are intentionally private. Keep the public-ticket bucket separate
// so callers cannot accidentally use its public URL flow for CSV exports.
export const EXPORT_STORAGE_BUCKET = 'exports';

export type StorageBucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/**
 * Runtime mirror of the single provisioning contract in migration 0013.
 * `storage:setup` verifies this contract only; it never mutates production
 * bucket configuration outside a database migration.
 */
export const STORAGE_BUCKET_DEFINITIONS = [
  {
    name: STORAGE_BUCKETS.eventPosters,
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
  {
    name: STORAGE_BUCKETS.ticketTemplates,
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
  {
    name: STORAGE_BUCKETS.participantFiles,
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
  {
    name: STORAGE_BUCKETS.tickets,
    public: true,
    allowedMimeTypes: ['image/png'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
  {
    name: EXPORT_STORAGE_BUCKET,
    public: false,
    allowedMimeTypes: ['text/csv'],
    fileSizeLimit: 50 * 1024 * 1024,
  },
] as const;
