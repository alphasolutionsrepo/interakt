-- `IF NOT EXISTS` is deliberate. This migration's journal timestamp was moved
-- forward (see the note on 0029) so that it applies to databases which took the
-- rewritten 0025 first and would otherwise skip it. A database that already
-- applied this migration under its original timestamp must not fail here.
ALTER TABLE "ai_experiences" ADD COLUMN IF NOT EXISTS "execution_policy" json;
