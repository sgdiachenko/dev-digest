CREATE TABLE "convention_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"job_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"sampled_files" jsonb,
	"proposed" integer DEFAULT 0 NOT NULL,
	"from_config" integer DEFAULT 0 NOT NULL,
	"dropped_ungrounded" integer DEFAULT 0 NOT NULL,
	"dropped_unsupported" integer DEFAULT 0 NOT NULL,
	"dropped_duplicate" integer DEFAULT 0 NOT NULL,
	"dropped_existing_skill" integer DEFAULT 0 NOT NULL,
	"dropped_category_cap" integer DEFAULT 0 NOT NULL,
	"model" text,
	"cost_usd" double precision,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "convention_scans_status_ck" CHECK ("convention_scans"."status" in ('running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "origin" text DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "support_count" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "probe" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "scan_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convention_scans_repo_started_idx" ON "convention_scans" USING btree ("repo_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_scan_id_convention_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."convention_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_ck" CHECK ("conventions"."status" in ('pending', 'accepted', 'rejected'));--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_category_ck" CHECK ("conventions"."category" in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'));--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_origin_ck" CHECK ("conventions"."origin" in ('model', 'config'));