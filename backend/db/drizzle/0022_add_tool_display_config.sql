-- Add display_config column to tools table
-- Maps tool result fields to semantic roles for frontend preset rendering
ALTER TABLE "tools" ADD COLUMN "display_config" json;
