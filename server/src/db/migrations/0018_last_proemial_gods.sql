CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"agent_version" integer,
	"config" jsonb,
	"case_ids" jsonb,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_completed" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_reason" text
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectations" jsonb;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "diff_source" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error_reason" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_name" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "dropped" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "expected_count" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "actual_count" integer;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_active_uq" ON "eval_suite_runs" USING btree ("agent_id") WHERE status in ('queued','running');--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_suite_runs_ws_started_idx" ON "eval_suite_runs" USING btree ("workspace_id","started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_name_uq" ON "eval_cases" USING btree ("owner_kind","owner_id","name");--> statement-breakpoint
CREATE INDEX "eval_cases_agent_idx" ON "eval_cases" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_ran_idx" ON "eval_runs" USING btree ("case_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_runs_suite_run_idx" ON "eval_runs" USING btree ("suite_run_id");