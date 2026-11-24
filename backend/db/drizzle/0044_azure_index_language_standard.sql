-- Azure AI Search indexes run on the standard analyzer, whatever their language says.
--
-- Until now an Azure index ignored its language: the create form defaulted it to
-- 'english', but no analyzer was ever set from it, so every Azure index really ran
-- on standard.lucene. The language is applied from now on. Moving the stored value
-- to 'standard' keeps each existing index doing what it does today; otherwise the
-- next reindex would quietly switch it to the English analyzer. Anyone who wants a
-- language analyzer picks one on the edit page and reindexes.
UPDATE "search_index" SET "language" = 'standard' WHERE "search_provider" = 'azure-ai-search';
