CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"path" text NOT NULL,
	"host" text NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"entry_path" text NOT NULL,
	"referrer" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."analytics_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_project_created_at_idx" ON "analytics_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_project_visitor_last_seen_idx" ON "analytics_sessions" USING btree ("project_id","visitor_hash","last_seen_at");