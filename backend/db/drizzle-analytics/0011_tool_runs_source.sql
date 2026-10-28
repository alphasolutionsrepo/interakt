ALTER TABLE "ai_tool_executions" ADD COLUMN "source" varchar(20) DEFAULT 'api' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_tool_exec_source" ON "ai_tool_executions" USING btree ("source");