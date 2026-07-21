CREATE TABLE "check_in_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_session_id" uuid NOT NULL,
	"registration_id" uuid,
	"scanned_ticket_code" varchar(50) NOT NULL,
	"scan_method" varchar(50) NOT NULL,
	"scan_status" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"volunteer_name" varchar(255) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"location" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"poster_url" text,
	"capacity" integer NOT NULL,
	"registration_mode" varchar(50) NOT NULL,
	"volunteer_pin_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"field_name" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"options" jsonb
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"otp_code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"answers" jsonb,
	"status" varchar(50) NOT NULL,
	"ticket_code" varchar(8),
	"qr_code_url" text,
	"presence_status" varchar(50) DEFAULT 'Absent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_ticket_code_unique" UNIQUE("ticket_code")
);
--> statement-breakpoint
ALTER TABLE "check_in_logs" ADD CONSTRAINT "check_in_logs_check_in_session_id_check_in_sessions_id_fk" FOREIGN KEY ("check_in_session_id") REFERENCES "public"."check_in_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_logs" ADD CONSTRAINT "check_in_logs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_sessions" ADD CONSTRAINT "check_in_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otps" ADD CONSTRAINT "otps_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "registrations_event_id_idx" ON "registrations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_ticket_code_idx" ON "registrations" USING btree ("ticket_code");--> statement-breakpoint
CREATE INDEX "registrations_event_status_idx" ON "registrations" USING btree ("event_id","status");