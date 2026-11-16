// src/shared/test/document-writer-stub.ts

/**
 * The document writer for route tests that run the real document routes, keys and access checks
 * on PGlite: the calls that reach the search engine answer at once as an index that isn't in the
 * engine yet (IndexNotProvisionedError), which is what a test index is. Without it, a request
 * with a live key reaches the engine, and the test waits on a server CI doesn't have.
 *
 *   vi.mock('@/features/document-indexing/document-writer.service', async (original) =>
 *     (await import('@/shared/test/document-writer-stub')).documentWriterWithoutEngine(original));
 */

type Writer = typeof import('@/features/document-indexing/document-writer.service');

export async function documentWriterWithoutEngine(original: () => Promise<unknown>): Promise<Writer> {
  const real = (await original()) as Writer;
  const notInEngine = async (): Promise<never> => {
    throw new real.IndexNotProvisionedError('The test index is not in the search engine');
  };
  return {
    ...real,
    getDocument: notInEngine,
    listDocuments: notInEngine,
    writeDocuments: notInEngine,
    deleteDocumentsByFilter: notInEngine,
  };
}
