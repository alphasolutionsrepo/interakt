// src/shared/seeders/docs/docs.seeder.test.ts

/**
 * The docs setup records the Help Assistant it made, which is the one the built-in help check
 * trusts (built-in-help.ts). The registry and services are an in-memory stand-in; the recording
 * itself runs for real through built-in-help.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  registry: null as null | { checksum: string; metadata: Record<string, unknown> },
  help: null as null | { id: string; slug: string },
  lookupError: null as null | Error,
  registryError: null as null | Error,
  nextId: 1,
}));

const log = vi.hoisted(() => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

vi.mock('./docs-search.seeder', () => ({
  seedDocsSearch: async () => ({ skipped: true, reason: 'unchanged' }),
  getDocsSearchStatus: async () => null,
}));
vi.mock('./docs-source', () => ({
  DOCS_ROOT: '/docs',
  readDocs: async () => [{ slug: 'intro', title: 'Intro', content: '# Intro\nWelcome.' }],
  getAdminUserId: async () => 'admin',
}));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getResolvedDefaults: async () => ({ embedding: { providerId: 'p', modelId: 7, modelKey: 'embed', dimensions: 1536 } }),
}));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceBySlug: async () => ({ id: 'ds1' }),
  createDataSource: async () => ({ id: 'ds1' }),
  deleteDataSource: async () => {},
}));
vi.mock('@/features/knowledge-base/knowledge-base.service', () => ({
  listDocuments: async () => [],
  deleteDocument: async () => {},
  uploadDocument: async () => ({ document: { status: 'ready' }, chunkCount: 1 }),
}));
vi.mock('@/features/tools/tools.service', () => ({
  getToolsByDataSourceId: async () => [{ id: 't1', operation: 'search' }],
  createToolsForDataSource: async () => [],
  deleteTool: async () => {},
}));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: async () => {
    if (world.lookupError) throw world.lookupError;
    if (!world.help) throw new Error('not found');
    return world.help;
  },
  createAIExperience: async (input: { slug: string }) => {
    world.help = { id: `help-${world.nextId++}`, slug: input.slug };
    return world.help;
  },
  updateAIExperience: async () => world.help,
  deleteAIExperience: async () => {},
}));
vi.mock('@/shared/seeders/seed-registry.service', () => ({
  calculateChecksum: (data: unknown) => JSON.stringify(data),
  getRegistryEntry: async () => {
    if (world.registryError) throw world.registryError;
    return world.registry;
  },
  upsertRegistryEntry: async (_t: string, _k: string, checksum: string, metadata: Record<string, unknown>) => {
    world.registry = { checksum, metadata };
  },
  deleteRegistryEntry: async () => {},
}));

import { recordHelpAssistantOnStartup, seedDocs } from './docs.seeder';

beforeEach(() => {
  Object.assign(world, { registry: null, help: null, lookupError: null, registryError: null, nextId: 1 });
});

describe('the docs setup and the Help Assistant it records', () => {
  it('records the Help Assistant it created', async () => {
    await seedDocs();
    expect(world.help?.id).toBe('help-1');
    expect(world.registry?.metadata.experienceId).toBe('help-1');
  });

  it('records it again on a forced re-run (the registry entry is rewritten without it)', async () => {
    await seedDocs();
    await seedDocs({ force: true });
    expect(world.registry?.metadata.experienceId).toBe('help-1');
  });

  it('when unchanged, backfills a missing id but never replaces one', async () => {
    await seedDocs();
    delete world.registry!.metadata.experienceId; // an entry from before ids were recorded

    expect(await seedDocs()).toMatchObject({ skipped: true });
    expect(world.registry?.metadata.experienceId).toBe('help-1');

    world.registry!.metadata.experienceId = 'recorded-earlier';
    await seedDocs();
    expect(world.registry?.metadata.experienceId).toBe('recorded-earlier');
  });
});

describe('recordHelpAssistantOnStartup', () => {
  it('backfills a missing id but never replaces one', async () => {
    world.registry = { checksum: 'c', metadata: { documents: 1 } };
    world.help = { id: 'h9', slug: 'help-assistant' };

    await recordHelpAssistantOnStartup();
    expect(world.registry.metadata).toEqual({ documents: 1, experienceId: 'h9' });

    world.help = { id: 'lookalike', slug: 'help-assistant' };
    await recordHelpAssistantOnStartup();
    expect(world.registry.metadata.experienceId).toBe('h9');
  });

  it('records nothing before the docs setup ran, and never throws', async () => {
    world.help = { id: 'h9', slug: 'help-assistant' };
    await recordHelpAssistantOnStartup();
    expect(world.registry).toBeNull();

    world.registry = { checksum: 'c', metadata: {} };
    world.lookupError = new Error('experience lookup failed');
    await expect(recordHelpAssistantOnStartup()).resolves.toBeUndefined();
    expect(world.registry.metadata.experienceId).toBeUndefined();

    world.lookupError = null;
    world.registryError = new Error('database unavailable');
    await expect(recordHelpAssistantOnStartup()).resolves.toBeUndefined();
  });
});
