CREATE TABLE IF NOT EXISTS "registration_status_capabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" uuid NOT NULL,
  "scope" varchar(64) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "registration_status_capabilities_scope_check"
    CHECK ("scope" = 'registration-status')
);
--> statement-breakpoint
ALTER TABLE "registration_status_capabilities"
  ADD CONSTRAINT "registration_status_capabilities_registration_id_registrations_id_fk"
  FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registration_status_capabilities_token_hash_unique"
  ON "registration_status_capabilities" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_status_capabilities_active_lookup_idx"
  ON "registration_status_capabilities" USING btree ("token_hash", "scope", "expires_at", "revoked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_status_capabilities_registration_active_idx"
  ON "registration_status_capabilities" USING btree ("registration_id", "revoked_at");
