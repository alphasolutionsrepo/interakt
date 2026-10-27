// src/features/ai-experience/ai-experience.find-record-gate.test.ts

/**
 * A Find Record tool without name or code fields can't be added to an AI experience, on
 * create or by assigning it, and the API answers 400 with the reason. Whether a tool is set
 * up is the tools service's call (tools.lookup-fields.test.ts).
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const repo = vi.hoisted(() => ({
  isSlugAvailable: vi.fn(async () => true),
  createAIExperience: vi.fn(),
  getAIExperienceById: vi.fn(async () => ({ id: 'exp', slug: 'shop' })),
  getToolAssignment: vi.fn(async () => null),
  assignTool: vi.fn(async () => ({ id: 'assignment' })),
}));
vi.mock('./ai-experience.repository', () => repo);
const tools = vi.hoisted(() => ({ getToolById: vi.fn(), notReadyToAssign: vi.fn() }));
vi.mock('../tools/tools.service', () => tools);
vi.mock('./ai-experience.cache', () => ({ aiExperienceCache: { delete: vi.fn(), deletePattern: vi.fn(), clear: vi.fn() } }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));
vi.mock('@/features/guardrails/topic-gate.service', () => ({ setupTopicGateEmbeddings: vi.fn() }));
vi.mock('@/features/guardrails/topic-gate.cache', () => ({ getGlobalTopicGateCache: vi.fn() }));
// The full create body (persona, session, access...) isn't what this is about
vi.mock('./ai-experience.validation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createAIExperienceSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

import { handleAssignTool, handleCreateAIExperience } from './ai-experience.api.handlers';

const NOT_SET_UP = 'Find Record tool "Catalog Find Record" isn\'t set up: choose its name or code fields on the tool first';
const toolId = crypto.randomUUID();

const post = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  tools.getToolById.mockResolvedValue({ id: toolId, name: 'Catalog Find Record', isActive: true, operation: 'lookup' });
  tools.notReadyToAssign.mockResolvedValue(NOT_SET_UP);
});

describe('adding a Find Record tool that isn’t set up', () => {
  it('is refused when assigned, with the reason', async () => {
    const response = await handleAssignTool(post('http://localhost/api/ai-experiences/exp/tools', { toolId }), {
      params: Promise.resolve({ id: 'exp' }),
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("isn't set up");
    expect(repo.assignTool).not.toHaveBeenCalled();
  });

  it('is refused when an experience is created with it', async () => {
    const response = await handleCreateAIExperience(post('http://localhost/api/ai-experiences', { name: 'Shop', slug: 'shop', toolIds: [toolId] }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("isn't set up");
    expect(repo.createAIExperience).not.toHaveBeenCalled();
  });

  it('is assigned once it is set up', async () => {
    tools.notReadyToAssign.mockResolvedValue(undefined);

    const response = await handleAssignTool(post('http://localhost/api/ai-experiences/exp/tools', { toolId }), {
      params: Promise.resolve({ id: 'exp' }),
    });

    expect(response.status).toBe(201);
    expect(repo.assignTool).toHaveBeenCalled();
  });
});
