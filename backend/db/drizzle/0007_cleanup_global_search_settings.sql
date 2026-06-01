CREATE TABLE "global_search_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"search_timeout" integer DEFAULT 30000 NOT NULL,
	"rrf_rank_constant" integer DEFAULT 60 NOT NULL,
	"rrf_window_size" integer DEFAULT 100 NOT NULL,
	"lexical_weight" integer DEFAULT 10 NOT NULL,
	"semantic_weight" integer DEFAULT 10 NOT NULL
);
