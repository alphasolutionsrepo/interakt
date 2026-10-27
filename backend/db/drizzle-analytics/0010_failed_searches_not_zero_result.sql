-- A search that failed didn't find nothing: it didn't run. Stored failed searches were marked as
-- zero-result, so they showed in Failed Searches and the failed-search rate; new ones aren't.
UPDATE "search_events" SET "is_zero_result" = false WHERE "success" = false AND "is_zero_result" = true;
