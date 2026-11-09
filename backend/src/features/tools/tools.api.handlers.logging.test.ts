// src/features/tools/tools.api.handlers.logging.test.ts

/**
 * A tool request that fails answers as before and is logged once, by the error response,
 * with the request id, the operation and the error: a warning when the request was
 * refused (slug taken, a tool in use), an error when our side failed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectInvalidJson, notJson } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const service = vi.hoisted(() => ({ createTool: vi.fn(), deleteTool: vi.fn() }));
vi.mock('./tools.service', () => service);
vi.mock('@/features/data-source/data-source.service', () => ({}));
vi.mock('./tools.executor', () => ({ executeTool: vi.fn() }));
vi.mock('./lookup-fields.service', () => ({ lookupFieldsStatus: vi.fn() }));

import { handleCreateTool, handleDeleteTool, handleTestTool } from './tools.api.handlers';

const TOOL = {
  name: 'My Tool',
  slug: 'my-tool',
  aiDescription: 'This tool does something useful for the AI agent',
  executorType: 'data_source',
  dataSourceId: '550e8400-e29b-41d4-a716-446655440000',
  operation: 'search',
  executorConfig: { maxResults: 20, searchType: 'hybrid' },
};
const create = () => handleCreateTool(new NextRequest('http://localhost/api/tools', { method: 'POST', body: JSON.stringify(TOOL) }));
const remove = () => handleDeleteTool(
  new NextRequest('http://localhost/api/tools/t1', { method: 'DELETE' }),
  { params: Promise.resolve({ id: 't1' }) }
);

const testRun = (request: NextRequest) => handleTestTool(request, { params: Promise.resolve({ id: 't1' }) });
const testRequest = (body: string) => new NextRequest('http://localhost/api/tools/t1/test', { method: 'POST', body });

beforeEach(() => { logs.length = 0; });

describe('a tool request that fails', () => {
  it('answers a slug that is taken as before and logs it once, as a warning with the error', async () => {
    const taken = new Error('duplicate key value violates unique constraint "tools_slug_unique"');
    service.createTool.mockRejectedValue(taken);
    const res = await create();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: 'CONFLICT', message: 'A tool with this slug already exists. Please choose a different name.' });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId: body.requestId, operation: 'createTool', err: expect.objectContaining({ cause: taken }) }) }),
    ]);
  });

  it('answers a config it cannot use as before and logs it once, as a warning', async () => {
    service.createTool.mockRejectedValue(new Error('Invalid config: maxResults must be at least 1'));
    const res = await create();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid config: maxResults must be at least 1' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'createTool' }) })]);
  });

  it('logs a failure on our side once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.createTool.mockRejectedValue(down);
    const res = await create();
    const { requestId } = await res.json();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'createTool', err: down }) }),
    ]);
  });

  it('answers a tool that cannot be deleted as before and logs it once, as a warning', async () => {
    service.deleteTool.mockRejectedValue(new Error('Cannot delete a system tool'));
    const res = await remove();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Cannot delete a system tool' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'deleteTool' }) })]);
  });
});

describe('a tool test run with a body it cannot use', () => {
  it('answers a body that is not JSON 400, logged once as a warning', async () => {
    await expectInvalidJson(await testRun(notJson('http://localhost/api/tools/t1/test', 'POST')), logs);
  });

  it.each([
    ['no input', '{}'],
    ['an input that is not an object', '{"input": "red shoes"}'],
    ['an input that is a list', '{"input": ["red shoes"]}'],
    ['null', 'null'],
  ])('answers a body with %s 400, saying it needs an input object', async (_, body) => {
    const res = await testRun(testRequest(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Request body must contain an "input" object', requestId: expect.any(String) });
  });
});
