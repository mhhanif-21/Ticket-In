-- Split Manual Review OTP and ticket email configuration without deleting the
-- existing approval template. Existing rows become the ticket template.
ALTER TABLE "event_approval_email_templates"
  ADD COLUMN IF NOT EXISTS "template_kind" varchar(16) NOT NULL DEFAULT 'ticket';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_approval_email_templates_kind_check'
      AND conrelid = 'event_approval_email_templates'::regclass
  ) THEN
    ALTER TABLE "event_approval_email_templates"
      ADD CONSTRAINT "event_approval_email_templates_kind_check"
      CHECK ("template_kind" IN ('otp', 'ticket'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_approval_email_templates_pkey'
      AND conrelid = 'event_approval_email_templates'::regclass
  ) THEN
    ALTER TABLE "event_approval_email_templates"
      DROP CONSTRAINT "event_approval_email_templates_pkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_approval_email_templates_pkey'
      AND conrelid = 'event_approval_email_templates'::regclass
  ) THEN
    ALTER TABLE "event_approval_email_templates"
      ADD CONSTRAINT "event_approval_email_templates_pkey"
      PRIMARY KEY ("event_id", "template_kind");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "event_approval_email_templates_kind_idx"
  ON "event_approval_email_templates" ("event_id", "template_kind");
