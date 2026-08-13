CREATE TABLE "ticket_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"qstash_message_id" varchar(255),
	"last_error" text,
	"published_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_generation_jobs" ADD CONSTRAINT "ticket_generation_jobs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_generation_jobs_registration_id_unique" ON "ticket_generation_jobs" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "ticket_generation_jobs_status_idx" ON "ticket_generation_jobs" USING btree ("status");