ALTER TABLE "ci_installations" ADD COLUMN "github_repo_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_model" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_skills" jsonb;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_repo_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_s" double precision;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "unavailable_reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "skills" jsonb;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "memory_sha256" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "manifest_sha256" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "runner_build" text;--> statement-breakpoint
CREATE INDEX "ci_runs_ran_at_idx" ON "ci_runs" USING btree ("ran_at");--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_agent_repo_unique" UNIQUE("agent_id","repo");--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_identity_unique" UNIQUE("github_repo_id","workflow_run_id","run_attempt","ci_installation_id");