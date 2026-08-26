-- Batch 3: registration capacity lifecycle, volunteer revocation, and stable
-- dynamic-form identity. All backfills preserve existing event/form/answer data.

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "volunteer_session_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "form_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "check_in_sessions"
  ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "registrations"
  ADD COLUMN IF NOT EXISTS "form_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "form_fields"
  ADD COLUMN IF NOT EXISTS "field_key" varchar(128);
ALTER TABLE "form_fields"
  ADD COLUMN IF NOT EXISTS "field_kind" varchar(32);

-- Existing UUIDs are immutable, so they become the stable public answer key.
UPDATE "form_fields"
SET "field_key" = 'field_' || "id"::text
WHERE "field_key" IS NULL OR btrim("field_key") = '';

-- Legacy static fields are classified once. New application code relies on
-- field_kind rather than labels, while still rendering legacy rows safely.
UPDATE "form_fields"
SET "field_kind" = CASE
  WHEN regexp_replace(lower("field_name"), '\\s+', '', 'g') = 'nama' THEN 'static_name'
  WHEN regexp_replace(lower("field_name"), '\\s+', '', 'g') = 'email' THEN 'static_email'
  ELSE 'custom'
END
WHERE "field_kind" IS NULL OR btrim("field_kind") = '';

-- A historical malformed form can contain multiple legacy rows named Nama or
-- Email. Preserve those rows as custom history rather than failing migration;
-- only the oldest row receives the reserved static identity.
WITH ranked_static_fields AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "event_id", "field_kind"
    ORDER BY "order", "id"
  ) AS rank
  FROM "form_fields"
  WHERE "field_kind" IN ('static_name', 'static_email')
)
UPDATE "form_fields" AS fields
SET "field_kind" = 'custom'
FROM ranked_static_fields AS ranked
WHERE fields."id" = ranked."id" AND ranked.rank > 1;

ALTER TABLE "form_fields"
  ALTER COLUMN "field_key" SET NOT NULL;
ALTER TABLE "form_fields"
  ALTER COLUMN "field_key" SET DEFAULT ('field_' || gen_random_uuid()::text);
ALTER TABLE "form_fields"
  ALTER COLUMN "field_kind" SET NOT NULL;
ALTER TABLE "form_fields"
  ALTER COLUMN "field_kind" SET DEFAULT 'custom';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_fields_kind_check'
  ) THEN
    ALTER TABLE "form_fields"
      ADD CONSTRAINT "form_fields_kind_check"
      CHECK ("field_kind" IN ('custom', 'static_name', 'static_email'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "form_fields_event_field_key_unique"
  ON "form_fields" USING btree ("event_id", "field_key");
CREATE UNIQUE INDEX IF NOT EXISTS "form_fields_event_static_kind_unique"
  ON "form_fields" USING btree ("event_id", "field_kind")
  WHERE "field_kind" IN ('static_name', 'static_email');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registrations_status_check'
  ) THEN
    ALTER TABLE "registrations"
      ADD CONSTRAINT "registrations_status_check"
      CHECK ("status" IN ('Draft', 'Pending', 'Accepted', 'Rejected', 'Expired'));
  END IF;
END $$;

ALTER TABLE "ticket_generation_jobs"
  DROP CONSTRAINT IF EXISTS "ticket_generation_jobs_status_check";
ALTER TABLE "ticket_generation_jobs"
  ADD CONSTRAINT "ticket_generation_jobs_status_check"
  CHECK ("status" IN ('queued', 'publishing', 'published', 'processing', 'failed', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS "registrations_event_draft_idx"
  ON "registrations" USING btree ("event_id", "status")
  WHERE "status" = 'Draft';
