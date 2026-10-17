// src/features/data-source/data-source.service.cache.test.ts

/**
 * Changing or deleting a data source drops the cached search experiences that
 * search it, so they stop using its old name and on/off state at once.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  getDataSourceById: vi.fn(),
  updateDataSource: vi.fn(),
  deleteDataSource: vi.fn(),
}));
vi.mock('./data-source.repository', () => repository);

const invalidateByDataSource = vi.fn();
vi.mock('@/features/search-experience/search-experience.cache', () => ({
  invalidateByDataSource: (...args: unknown[]) => invalidateByDataSource(...args),
}));
vi.mock('@/features/search-index/search-index.repository', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/tools/tools.service', () => ({}));

import { deleteDataSource, updateDataSource, updateHealth } from './data-source.service';

const source = { id: 'ds-1', slug: 'external', name: 'External catalog', isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  repository.getDataSourceById.mockResolvedValue(source);
  repository.updateDataSource.mockImplementation(async (_id: string, data: object) => ({ ...source, ...data }));
});

describe('data source changes and the search experience cache', () => {
  it('drops cached experiences when the data source is updated', async () => {
    await updateDataSource('ds-1', { isActive: false }, 'user-1');
    expect(invalidateByDataSource).toHaveBeenCalledWith('ds-1');
  });

  it('drops them only after the change is saved', async () => {
    const order: string[] = [];
    repository.updateDataSource.mockImplementation(async () => { order.push('saved'); return source; });
    invalidateByDataSource.mockImplementation(async () => { order.push('invalidated'); });

    await updateDataSource('ds-1', { name: 'Renamed' }, 'user-1');

    expect(order).toEqual(['saved', 'invalidated']);
  });

  it('drops cached experiences when the data source is deleted', async () => {
    await deleteDataSource('ds-1', 'user-1');
    expect(repository.deleteDataSource).toHaveBeenCalledWith('ds-1');
    expect(invalidateByDataSource).toHaveBeenCalledWith('ds-1');
  });

  it('leaves the cache alone for a health update, which changes nothing it holds', async () => {
    await updateHealth('ds-1', { status: 'healthy', message: 'ok' });
    expect(invalidateByDataSource).not.toHaveBeenCalled();
  });

  it('does not touch the cache for a data source that does not exist', async () => {
    repository.getDataSourceById.mockResolvedValue(null);
    await expect(updateDataSource('ds-9', { name: 'x' }, 'user-1')).rejects.toThrow();
    expect(invalidateByDataSource).not.toHaveBeenCalled();
  });
});
