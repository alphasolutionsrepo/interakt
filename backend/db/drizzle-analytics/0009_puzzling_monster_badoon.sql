CREATE TABLE "analytics_hidden_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"finding_id" varchar(100) NOT NULL,
	"hidden_until" timestamp with time zone NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_hidden_findings_scope" UNIQUE("scope","finding_id")
);
