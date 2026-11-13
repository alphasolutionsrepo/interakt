// src/features/ai-providers/shortenable-embeddings.ts

/**
 * Embedding model families that return a shorter vector when asked for one (trained so the
 * start of the vector still works on its own). A new model of one of these is marked able to
 * shorten its vectors; an admin can change the mark on any model.
 *
 * Only families checked to honour a requested size are listed:
 * - qwen3-embedding: Ollama returned the size asked for (1536 of 2560) in a local run.
 * - nomic-embed-text: Ollama returned the size asked for (256 of 768) in a local run.
 * - text-embedding-3-*: OpenAI documents a `dimensions` parameter for these models.
 */
const SHORTENABLE_FAMILIES = [
    /^qwen3-embedding(?::|$)/,
    /^nomic-embed-text(?::|$)/,
    /^text-embedding-3-/,
];

export function canShortenVectorsByDefault(modelKey: string, modelType: string): boolean {
    if (modelType !== 'embedding') return false;
    // A key can carry a registry path ("library/qwen3-embedding:4b") or a vendor prefix ("openai/text-embedding-3-small")
    const name = modelKey.toLowerCase().split('/').pop() ?? '';
    return SHORTENABLE_FAMILIES.some((family) => family.test(name));
}
