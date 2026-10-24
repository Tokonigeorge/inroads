ALTER TABLE "events" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;