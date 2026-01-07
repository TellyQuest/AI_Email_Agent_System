CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"conversation_id" varchar(255),
	"subject" text NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"sender_name" varchar(255),
	"recipient_email" varchar(255) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"body_text" text,
	"body_html" text,
	"raw_headers" jsonb,
	"has_attachments" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"classification" jsonb,
	"client_id" uuid,
	"match_method" varchar(50),
	"match_confidence" numeric(3, 2),
	"extracted_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	CONSTRAINT "emails_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "valid_status" CHECK ("emails"."status" IN ('pending', 'processing', 'classified', 'matched', 'extracted', 'planned', 'completed', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "client_email_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_pattern" varchar(255) NOT NULL,
	"client_id" uuid NOT NULL,
	"pattern_type" varchar(20) NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.0',
	"source" varchar(50) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unique_email_pattern" UNIQUE("email_pattern","pattern_type")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"quickbooks_id" varchar(100),
	"billcom_id" varchar(100),
	"email_domains" text[] DEFAULT '{}'::text[],
	"known_emails" text[] DEFAULT '{}'::text[],
	"keywords" text[] DEFAULT '{}'::text[],
	"default_expense_account" varchar(100),
	"approval_threshold" numeric(12, 2) DEFAULT '5000.00',
	"auto_approve_vendors" text[] DEFAULT '{}'::text[],
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"saga_id" uuid,
	"action_type" varchar(50) NOT NULL,
	"target_system" varchar(50) NOT NULL,
	"parameters" jsonb NOT NULL,
	"risk_level" varchar(20) NOT NULL,
	"risk_reasons" text[] DEFAULT '{}'::text[],
	"requires_approval" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"executed_at" timestamp with time zone,
	"result" jsonb,
	"external_id" varchar(255),
	"error" text,
	"is_compensated" boolean DEFAULT false,
	"compensated_at" timestamp with time zone,
	"compensation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "valid_action_status" CHECK ("actions"."status" IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'compensated'))
);
--> statement-breakpoint
CREATE TABLE "sagas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 0,
	"total_steps" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"compensated_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "valid_saga_status" CHECK ("sagas"."status" IN ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'compensating', 'compensated'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"event_category" varchar(50) NOT NULL,
	"email_id" uuid,
	"action_id" uuid,
	"saga_id" uuid,
	"client_id" uuid,
	"user_id" uuid,
	"description" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"metadata" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"checksum" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"storage_bucket" varchar(100) NOT NULL,
	"content_hash" varchar(64),
	"extraction_status" varchar(50) DEFAULT 'pending',
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_email_mappings" ADD CONSTRAINT "client_email_mappings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_saga_id_sagas_id_fk" FOREIGN KEY ("saga_id") REFERENCES "public"."sagas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sagas" ADD CONSTRAINT "sagas_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_emails_status" ON "emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_emails_client_id" ON "emails" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_emails_received_at" ON "emails" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "idx_emails_sender_email" ON "emails" USING btree ("sender_email");--> statement-breakpoint
CREATE INDEX "idx_clients_quickbooks_id" ON "clients" USING btree ("quickbooks_id");--> statement-breakpoint
CREATE INDEX "idx_clients_billcom_id" ON "clients" USING btree ("billcom_id");--> statement-breakpoint
CREATE INDEX "idx_actions_email_id" ON "actions" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "idx_actions_status" ON "actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_actions_requires_approval" ON "actions" USING btree ("requires_approval");--> statement-breakpoint
CREATE INDEX "idx_audit_log_timestamp" ON "audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_log_email_id" ON "audit_log" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_event_type" ON "audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_audit_log_event_category" ON "audit_log" USING btree ("event_category");--> statement-breakpoint
CREATE INDEX "idx_attachments_email_id" ON "attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_content_hash" ON "attachments" USING btree ("content_hash");