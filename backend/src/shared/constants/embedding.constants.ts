// src/shared/constants/embedding.constants.ts

/**
 * The vector field every index stores its embeddings in, on every search engine.
 * Declared once, in a module with no imports, so the engines and the indexing code can
 * all use it without importing each other.
 *
 * Reads that feed a UI exclude this field: a vector is thousands of floats and useless
 * to display.
 */
export const EMBEDDING_FIELD_NAME = 'content_embedding';
