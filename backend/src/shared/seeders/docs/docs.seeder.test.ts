// src/shared/seeders/docs/docs.seeder.test.ts

/**
 * The docs setup marks the Help Assistant it makes as the built-in help (open to every
 * signed-in user, changed only by an Admin), and never takes over someone else's experience
 * under the same slug. The registry and services are an in-memory stand-in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  registry: null as null | { checksum: string; metadata: Record<string, unknown> },
  help: null as null | { id: string; slug: string; isBuiltIn: boolean },
  dataSource: null as null | { id: string; isBuiltIn: boolean },
  tools: [] as Array<{ id: string; slug: string; operation: string; isBuiltIn: boolean }>,
  assignedTool: null as null | string,
  marked: new Set<string>(),
  deleted: [] as string[],
  nextId: 1,
  uploads: 0,
  searchBuilds: 0,
}));

const log = vi.hoisted(() => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

vi.mock('./docs-search.seeder', () => ({
  seedDocsSearch: async () => { world.searchBuilds++; return { skipped: true, reason: 'unchanged' }; },
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
  getDataSourceBySlug: async () => world.dataSource,
  createDataSource: async () => (world.dataSource = { id: 'ds1', isBuiltIn: false }),
  deleteDataSource: async (id: string) => { world.deleted.push(`data-source:${id}`); },
}));
vi.mock('@/features/access/built-in', () => ({
  markBuiltIn: async (kind: string, ids: string[]) => {
    for (const id of ids) world.marked.add(`${kind}:${id}`);
    if (kind === 'data-source' && world.dataSource && ids.includes(world.dataSource.id)) world.dataSource.isBuiltIn = true;
    if (kind === 'tool') for (const t of world.tools) if (ids.includes(t.id)) t.isBuiltIn = true;
  },
}));
vi.mock('@/features/knowledge-base/knowledge-base.service', () => ({
  listDocuments: async () => [],
  deleteDocument: async () => {},
  uploadDocument: async () => {
    world.uploads++;
    return { document: { status: 'ready' }, chunkCount: 1 };
  },
}));
vi.mock('@/features/tools/tools.service', () => ({
  getToolsByDataSourceId: async () => world.tools,
  // Like the real one: makes each operation no counted tool covers yet
  createToolsForDataSource: async (...args: unknown[]) => {
    const counting = (args[6] as { counting?: (t: { isBuiltIn: boolean }) => boolean } | undefined)?.counting ?? (() => true);
    const covered = new Set(world.tools.filter(counting).map((t) => t.operation));
    const made = ['search', 'get'].filter((op) => !covered.has(op))
      .map((op) => ({ id: `t-${op}-${world.tools.length + 1}`, slug: `interakt-docs-${op}`, operation: op, isBuiltIn: false }));
    world.tools.push(...made);
    return made;
  },
  deleteTool: async () => {},
}));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: async () => {
    if (!world.help) throw new Error('not found');
    return world.help;
  },
  createAIExperience: async (input: { slug: string; toolIds?: string[] }) => {
    world.assignedTool = input.toolIds?.[0] ?? null;
    world.help = { id: `help-${world.nextId++}`, slug: input.slug, isBuiltIn: false };
    return world.help;
  },
  markAIExperienceBuiltIn: async (id: string) => {
    if (world.help?.id === id) world.help.isBuiltIn = true;
  },
  updateAIExperience: async (_id: string, input: { toolIds?: string[] }) => {
    world.assignedTool = input.toolIds?.[0] ?? null;
    return world.help;
  },
  deleteAIExperience: async (id: string) => { world.deleted.push(`ai-experience:${id}`); },
}));
vi.mock('@/shared/seeders/seed-registry.service', () => ({
  calculateChecksum: (data: unknown) => JSON.stringify(data),
  getRegistryEntry: async () => world.registry,
  upsertRegistryEntry: async (_t: string, _k: string, checksum: string, metadata: Record<string, unknown>) => {
    world.registry = { checksum, metadata };
  },
  deleteRegistryEntry: async () => {},
}));

import { ConflictError } from '@/shared/errors/app-error';

import { resetDocs, seedDocs } from './docs.seeder';

beforeEach(() => {
  Object.assign(world, { registry: null, help: null, dataSource: null, tools: [], assignedTool: null, marked: new Set(), deleted: [], nextId: 1, uploads: 0, searchBuilds: 0 });
});

describe('the docs setup and the Help Assistant', () => {
  it('marks the Help Assistant it creates as the built-in help', async () => {
    await seedDocs();
    expect(world.help).toMatchObject({ id: 'help-1', isBuiltIn: true });
  });

  it('updates its own Help Assistant on a re-run and keeps it built in', async () => {
    await seedDocs();
    await seedDocs({ force: true });
    expect(world.help).toMatchObject({ id: 'help-1', isBuiltIn: true });
  });

  it("refuses someone else's experience under the Help Assistant's slug, before changing anything", async () => {
    world.help = { id: 'theirs', slug: 'help-assistant', isBuiltIn: false };

    await expect(seedDocs()).rejects.toBeInstanceOf(ConflictError);
    expect(world.help).toMatchObject({ id: 'theirs', isBuiltIn: false });
    expect(world.uploads).toBe(0);
    expect(world.searchBuilds).toBe(0);
    expect(world.registry).toBeNull();
  });

  it('marks the docs data source and its tools as part of the built-in help', async () => {
    await seedDocs();
    expect([...world.marked].sort()).toEqual(['data-source:ds1', ...world.tools.map((t) => `tool:${t.id}`)].sort());
    expect(world.tools.map((t) => t.operation).sort()).toEqual(['get', 'search']);
  });

  it("refuses someone else's data source under the docs slug, before changing anything", async () => {
    world.dataSource = { id: 'theirs', isBuiltIn: false };

    await expect(seedDocs()).rejects.toBeInstanceOf(ConflictError);
    expect(world.uploads).toBe(0);
    expect(world.searchBuilds).toBe(0);
    expect(world.marked.size).toBe(0);
  });

  it('resets only what it made, never a lookalike under the same slugs', async () => {
    world.help = { id: 'theirs-help', slug: 'help-assistant', isBuiltIn: false };
    world.dataSource = { id: 'theirs-ds', isBuiltIn: false };
    await resetDocs();
    expect(world.deleted).toEqual([]);

    world.help = { id: 'help-1', slug: 'help-assistant', isBuiltIn: true };
    world.dataSource = { id: 'ds1', isBuiltIn: true };
    await resetDocs();
    expect(world.deleted).toEqual(['ai-experience:help-1', 'data-source:ds1']);
  });

  it("uses and marks only the tools it made, never one someone added to the docs data source", async () => {
    await seedDocs();
    // Someone adds their own search tool to the docs data source (an Admin could; nobody else can)
    world.tools.unshift({ id: 'theirs', slug: 'my-search', operation: 'search', isBuiltIn: false });
    const ours = world.tools.find((t) => t.operation === 'search' && t.isBuiltIn)!.id;
    await seedDocs({ force: true });
    expect(world.assignedTool).toBe(ours);
    expect(world.tools.find((t) => t.id === 'theirs')?.isBuiltIn).toBe(false);
    expect(world.marked.has('tool:theirs')).toBe(false);
  });

  it("makes its own search tool again when it's gone, even with someone else's search tool there", async () => {
    world.tools.push({ id: 'theirs', slug: 'my-search', operation: 'search', isBuiltIn: false });
    await seedDocs();
    const mine = world.tools.find((t) => t.operation === 'search' && t.isBuiltIn);
    expect(mine).toBeDefined();
    expect(world.assignedTool).toBe(mine!.id);

    // The setup's search tool deleted; its other tool kept
    world.tools = world.tools.filter((t) => t.id !== mine!.id);
    await seedDocs({ force: true });
    const again = world.tools.find((t) => t.operation === 'search' && t.isBuiltIn);
    expect(again && again.id !== mine!.id).toBe(true);
    expect(world.assignedTool).toBe(again!.id);
    expect(world.tools.filter((t) => t.operation === 'get' && t.isBuiltIn)).toHaveLength(1);
  });
});
