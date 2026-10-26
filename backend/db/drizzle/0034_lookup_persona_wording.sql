-- Experience instructions stop saying Find Record works "by ID" where it also takes a name.
--
-- The create wizard wrote "When users ask questions, use your tools to ..., look up specific
-- items by ID, ..." into each experience's instructions. Find Record on a search index now
-- takes an id, a SKU or a name (0033 updated the tools' own descriptions), and the wizard now
-- writes "look up specific items". Only that phrase inside the generated sentence is changed,
-- and only for experiences with a Find Record tool on a managed or external search index; the
-- rest of the instructions, and text an admin wrote elsewhere, are kept. File-store lookups
-- take an id only, so experiences with only those keep "by ID".
-- The planner reads these instructions every turn. An admin who kept the generated sentence
-- can't be told apart from one who meant "by ID"; the sentence described what the tool did when
-- it was written, and the tool now does more, so it is updated like the tool's own text.
UPDATE "ai_experiences" AS e
SET "persona_config" = jsonb_set(
  e."persona_config"::jsonb,
  '{systemInstructions}',
  to_jsonb(regexp_replace(
    e."persona_config"->>'systemInstructions',
    '(When users ask questions, use your tools to [^.]*)look up specific items by ID(?=[,.])',
    '\1look up specific items'
  ))
)::json
WHERE e."persona_config"->>'systemInstructions' ~ 'When users ask questions, use your tools to [^.]*look up specific items by ID(?=[,.])'
  AND EXISTS (
    SELECT 1
    FROM "ai_experience_tools" AS et
    JOIN "tools" AS t ON t."id" = et."tool_id"
    JOIN "data_sources" AS ds ON ds."id" = t."data_source_id"
    WHERE et."ai_experience_id" = e."id"
      AND t."operation" = 'lookup'
      AND ds."type" IN ('search_index', 'search_index_external')
  );
