-- Analytics sessions keep no client address: empty any hash stored before. The column itself is dropped in a later release.
UPDATE "analytics_sessions" SET "ip_hash" = NULL WHERE "ip_hash" IS NOT NULL;
