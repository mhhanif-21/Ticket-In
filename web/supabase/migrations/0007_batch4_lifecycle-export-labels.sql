-- Batch 4: durable event publication lifecycle, historical export labels,
-- and observable export publish/worker state.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "status" varchar(20);
-- Rows that predate the lifecycle column were already publicly usable.
UPDATE "events"
SET "status" = 'Published'
WHERE "status" IS NULL OR "status" = 'Active';
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'Draft';
ALTER TABLE "events" ALTER COLUMN "status" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_status_check"
      CHECK ("status" IN ('Draft', 'Published', 'Cancelled'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "events_status_idx" ON "events" USING btree ("status");

ALTER TABLE "registrations"
  ADD COLUMN IF NOT EXISTS "answer_field_labels" jsonb;

ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "qstash_message_id" varchar(255);
ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "published_at" timestamp;
ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
ALTER TABLE "export_jobs"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
UPDATE "export_jobs" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
CREATE INDEX IF NOT EXISTS "export_jobs_status_idx" ON "export_jobs" USING btree ("status");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_jobs_status_check'
  ) THEN
    ALTER TABLE "export_jobs"
      ADD CONSTRAINT "export_jobs_status_check"
      CHECK ("status" IN ('pending', 'publishing', 'published', 'processing', 'completed', 'failed'));
  END IF;
END $$;
