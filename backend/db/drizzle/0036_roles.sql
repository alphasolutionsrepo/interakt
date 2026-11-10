-- Roles become rows that admins can edit. Before this migration a user's role was a fixed enum
-- (user / moderator / admin) and only user management, demo/docs setup and background jobs
-- checked it: every other admin page and API was open to any signed-in user.
--
-- Existing users keep the closest role (decided 9 Nov 2026):
--   admin     -> Admin  (built in, every permission)
--   moderator -> Editor (everything except AI provider keys, running jobs, secrets, users and setup)
--   user      -> Viewer (read-only); NULL is treated as user, the column's old default
-- Users who could edit as 'user' before become read-only until an admin changes their role.
-- The Editor and Viewer permission lists equal EDITOR_DEFAULT_PERMISSIONS and
-- VIEWER_DEFAULT_PERMISSIONS in src/features/access/permissions.ts (a test checks this).
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "roles" ("id", "name", "description", "permissions", "is_built_in") VALUES
	('00000000-0000-4000-8000-000000000001', 'Admin', 'Full access, including users, roles, secrets and AI provider keys.', '{}', true),
	('00000000-0000-4000-8000-000000000002', 'Editor', 'Builds and runs experiences, indexes, tools and settings. No access to users, secrets or AI provider keys.',
		ARRAY['search-experiences:view','search-experiences:edit','ai-experiences:view','ai-experiences:edit',
		      'search-indexes:view','search-indexes:edit','documents:edit','data-sources:view','data-sources:edit',
		      'tools:view','tools:edit','prompts:view','prompts:edit','ai-providers:view',
		      'playground:use','analytics:view','analytics:ask','analytics:manage',
		      'settings:view','settings:manage'], false),
	('00000000-0000-4000-8000-000000000003', 'Viewer', 'Read-only access to experiences, indexes, tools and analytics.',
		ARRAY['search-experiences:view','ai-experiences:view','search-indexes:view','data-sources:view',
		      'tools:view','prompts:view','analytics:view'], false);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role_id" uuid;--> statement-breakpoint
UPDATE "user" SET "role_id" = CASE "role"
	WHEN 'admin' THEN '00000000-0000-4000-8000-000000000001'::uuid
	WHEN 'moderator' THEN '00000000-0000-4000-8000-000000000002'::uuid
	ELSE '00000000-0000-4000-8000-000000000003'::uuid
END;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE "public"."user_role";
