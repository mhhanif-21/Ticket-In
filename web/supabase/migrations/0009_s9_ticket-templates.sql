CREATE TABLE IF NOT EXISTS "event_ticket_templates" (
  "event_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."events"("id") ON DELETE cascade,
  "mode" varchar(16) NOT NULL DEFAULT 'default',
  "background_path" text,
  "elements" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "event_ticket_templates_mode_check" CHECK ("mode" IN ('default', 'custom'))
);

CREATE TABLE IF NOT EXISTS "event_approval_email_templates" (
  "event_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."events"("id") ON DELETE cascade,
  "is_active" boolean NOT NULL DEFAULT false,
  "subject" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
