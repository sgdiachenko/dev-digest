CREATE TABLE "context_catalogs" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"branch" text,
	"scanned_sha" text,
	"scanned_at" timestamp with time zone,
	"scan_started_at" timestamp with time zone,
	"total_files" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_docs" (
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"category" text NOT NULL,
	"size" integer NOT NULL,
	"est_tokens" integer,
	"status" text NOT NULL,
	"secret_warning" boolean DEFAULT false NOT NULL,
	"blob_oid" text NOT NULL,
	CONSTRAINT "context_docs_repo_id_path_pk" PRIMARY KEY("repo_id","path")
);
--> statement-breakpoint
ALTER TABLE "context_catalogs" ADD CONSTRAINT "context_catalogs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_catalogs" ADD CONSTRAINT "context_catalogs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_docs" ADD CONSTRAINT "context_docs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_catalogs_ws_idx" ON "context_catalogs" USING btree ("workspace_id");