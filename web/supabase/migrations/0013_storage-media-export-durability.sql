-- Batch 4: canonical storage provisioning, durable object cleanup, and
-- scalable private CSV exports. This migration is the only provisioning
-- source; the application script verifies rather than mutates bucket config.

CREATE TABLE IF NOT EXISTS "storage_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket" varchar(128) NOT NULL,
  "storage_path" text NOT NULL,
  "reason" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'held',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "expires_at" timestamp NOT NULL,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "cleanup_lease_expires_at" timestamp,
  "cleaned_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "storage_cleanup_jobs_status_check"
    CHECK ("status" IN ('held', 'cleanup_pending', 'cleaning', 'cleaned'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_cleanup_jobs_bucket_path_unique"
  ON "storage_cleanup_jobs" USING btree ("bucket", "storage_path");
CREATE INDEX IF NOT EXISTS "storage_cleanup_jobs_retry_idx"
  ON "storage_cleanup_jobs" USING btree ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "storage_cleanup_jobs_expiry_idx"
  ON "storage_cleanup_jobs" USING btree ("status", "expires_at");

ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "storage_path" text;
CREATE UNIQUE INDEX IF NOT EXISTS "export_jobs_storage_path_unique"
  ON "export_jobs" USING btree ("storage_path")
  WHERE "storage_path" IS NOT NULL;

-- A data URI can grow without a database-enforced bound. Old ephemeral export
-- payloads are intentionally invalidated; the owner can re-run the export.
UPDATE "export_jobs"
SET
  "file_url" = NULL,
  "storage_path" = NULL,
  "status" = 'failed',
  "last_error" = 'export_result_invalidated',
  "updated_at" = now()
WHERE "file_url" LIKE 'data:text/csv;base64,%';

-- Supabase owns the storage schema in production. The guarded dynamic SQL
-- keeps ordinary PostgreSQL integration databases compatible while applying
-- the exact contract whenever Storage is present.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES
        ('event_posters', 'event_posters', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]),
        ('ticket_templates', 'ticket_templates', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]),
        ('participant_files', 'participant_files', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']::text[]),
        ('tickets', 'tickets', true, 5242880, ARRAY['image/png']::text[]),
        ('exports', 'exports', false, 52428800, ARRAY['text/csv']::text[])
      ON CONFLICT (id) DO UPDATE
      SET
        name = EXCLUDED.name,
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'ticketin_public_event_media_read'
    ) THEN
    EXECUTE $policy$
      CREATE POLICY ticketin_public_event_media_read
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id IN ('event_posters', 'tickets'))
    $policy$;
  END IF;
END $$;
