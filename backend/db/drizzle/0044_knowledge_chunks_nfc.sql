-- Keyword search compares stored chunk text directly, so store it composed (NFC).
--
-- Text with decomposed accents (a letter plus a separate mark) would no longer match a typed
-- word. New chunks are composed when they are written; this converts the ones already stored.
-- normalize() only works on a UTF8 database, so other encodings are left alone.
DO $$
BEGIN
  IF (SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()) = 'UTF8' THEN
    UPDATE "knowledge_chunks" SET "content" = normalize("content", NFC) WHERE "content" IS NOT NFC NORMALIZED;
  END IF;
END $$;
