CREATE TABLE "resubmit_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"normalized_email" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resubmit_tokens" ADD CONSTRAINT "resubmit_tokens_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resubmit_tokens" ADD CONSTRAINT "resubmit_tokens_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resubmit_tokens_jti_unique" ON "resubmit_tokens" USING btree ("jti");--> statement-breakpoint
CREATE UNIQUE INDEX "resubmit_tokens_token_hash_unique" ON "resubmit_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "resubmit_tokens_registration_active_idx" ON "resubmit_tokens" USING btree ("registration_id","used_at");