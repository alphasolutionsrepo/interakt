// src/features/pipeline/chat-pipeline.session-owner.test.ts

/**
 * A chat turn for one experience given another experience's session id starts a new
 * session for its own experience and leaves the other conversation untouched. Runs
 * runChatPipeline with the real sessions service on Postgres (PGlite); only the AI
 * model, classifier and tools are faked.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  classifyMessage: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));
vi.mock('@/features/telemetry', async () => {
  const { ATTR } = await vi.importActual<typeof import('@/features/telemetry/attribute-keys')>('@/features/telemetry/attribute-keys');
  const span = { setAttribute: vi.fn(), setAttributes: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
  return { ATTR, withSpan: (_options: unknown, fn: (s: typeof span) => unknown) => fn(span) };
});
vi.mock('@/features/search/search.service', () => ({
  withExperienceContext: (_experienceId: string, fn: () => unknown) => fn(),
}));
vi.mock('@/features/ai-service/ai-service.service', () => ({ chat: mocks.chat }));
vi.mock('@/features/guardrails/message-classifier', () => ({ classifyMessage: mocks.classifyMessage }));
vi.mock('@/features/tools/tools.executor', () => ({ executeTool: mocks.executeTool }));
vi.mock('@/features/analytics', () => ({ trackToolExecution: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/features/embedding', () => ({ embed: vi.fn().mockResolvedValue(null), prepareMessageText: vi.fn(() => 'text') }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceById: vi.fn(async (id: string) => ({ id, isActive: true })),
}));
vi.mock('@/features/sessions/summarization.service', () => ({ summarizeSession: vi.fn().mockResolvedValue({ performed: false }) }));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/user-memories/memory-extraction.service', () => ({ extractMemoriesFromSession: vi.fn().mockResolvedValue({ stored: 0, extracted: 0 }) }));

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { runChatPipeline } from './chat-pipeline';

import { aiExperiences, aiSessions, aiSessionMessages } from '@/db/schema';
import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';
import * as sessionsService from '@/features/sessions/sessions.service';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';


const EXPERIENCE_MODEL = { providerId: 1, modelId: 2 };

function makeExperience(guardrailConfig: unknown = null): AIExperienceWithTools {
  return {
    id: 'exp-1',
    slug: 'test-exp',
    ...EXPERIENCE_MODEL,
    pipelineMode: 'deterministic',
    executionPolicy: null,
    guardrailConfig,
    personaConfig: {
      systemInstructions: 'Be helpful.',
      businessDomains: ['E-commerce'],
      tone: 'friendly',
      name: 'TestBot',
      responseFormats: { enabledPresets: ['rich_text', 'item_grid'], defaultPreset: 'rich_text' },
    },
    sessionConfig: { maxContextMessages: 6 },
    mcpConnections: [],
    tools: [{
      isEnabled: true,
      overrideAiDescription: null,
      tool: {
        id: 'tool-1',
        name: 'product-search',
        slug: 'product-search',
        executorType: 'data_source',
        operation: 'search',
        aiDescription: 'Search for products',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
        isActive: true,
        dataSourceId: 'ds-1',
        displayConfig: null,
      },
    }],
  } as unknown as AIExperienceWithTools;
}

/** An input guardrail that runs the classifier. */
const GUARDRAIL_ON = {
  inputGuardrail: { enabled: true, rules: [{ type: 'blocklist', enabled: true, config: { terms: [] } }] },
};

function chatResult(content: string): ChatResult {
  return {
    message: { role: 'assistant', content },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 200 },
  };
}

/** The model's replies for a turn that plans one search, extracts its query and answers. */
function scriptSearchTurn() {
  mocks.chat
    .mockResolvedValueOnce(chatResult(JSON.stringify({
      actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false }],
      reasoning: 'User wants to search',
      directResponse: false,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 0.95,
    })))
    .mockResolvedValueOnce(chatResult(JSON.stringify({ query: 'red shoes' })))
    .mockResolvedValueOnce(chatResult('I found some red shoes for you!'));
  mocks.executeTool.mockResolvedValue({ success: true, data: [{ id: 'p1', title: 'Red Shoes', price: 89 }], resultCount: 1 });
}


let expA: string;
let expB: string;
let sessionA: string;

async function messagesOf(sessionId: string) {
  const rows = await testDb.db.select().from(aiSessionMessages).where(eq(aiSessionMessages.sessionId, sessionId));
  return rows.map((r) => `${r.role}:${r.content}`).sort();
}

async function turnForB(message: string, guardrailConfig: unknown = null) {
  return turnFor(expB, message, guardrailConfig);
}

async function turnFor(experienceId: string, message: string, guardrailConfig: unknown = null) {
  const events: Array<{ type: string; sessionId?: string }> = [];
  await runChatPipeline({
    experience: { ...makeExperience(guardrailConfig), id: experienceId },
    message,
    sessionId: sessionA,
    onEvent: (e) => events.push(e as never),
  });
  return events.find((e) => e.type === 'done')!.sessionId!;
}

beforeAll(async () => {
  testDb = await createAppTestDb();
  const make = async (slug: string) => (await testDb.db.insert(aiExperiences).values({
    name: slug, slug, createdBy: '00000000-0000-0000-0000-000000000001',
    personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
  } as never).returning())[0].id;
  expA = await make('exp-a');
  expB = await make('exp-b');
}, 60_000);
afterAll(() => testDb.close());

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.chat.mockReset();
  featureSwitchesStub.reset();
  sessionA = (await sessionsService.createSession({ aiExperienceId: expA, ttlMinutes: 60 })).id;
  await sessionsService.addMessages(sessionA, [{ role: 'user', content: 'A question' }, { role: 'assistant', content: 'A answer' }] as never);
  mocks.classifyMessage.mockResolvedValue({ classification: 'task', debug: { greetingRegexMatched: false, domainFilterEnabled: false } });
});

describe('a chat turn with another experience\'s session id', () => {
  it('starts a new session for its own experience and leaves the other conversation alone (normal turn)', async () => {
    scriptSearchTurn();

    const doneId = await turnForB('Search for red shoes');

    expect(doneId).not.toBe(sessionA);
    const [created] = await testDb.db.select().from(aiSessions).where(eq(aiSessions.id, doneId));
    expect(created.aiExperienceId).toBe(expB);
    expect(await messagesOf(sessionA)).toEqual(['assistant:A answer', 'user:A question']);
    expect(await messagesOf(doneId)).toContain('user:Search for red shoes');
    // The model never saw the other conversation
    expect(JSON.stringify(mocks.chat.mock.calls)).not.toContain('A question');
  });

  it('does the same for a greeting reply', async () => {
    mocks.classifyMessage.mockResolvedValue({ classification: 'greeting', debug: { greetingRegexMatched: true, domainFilterEnabled: false } });
    mocks.chat.mockResolvedValueOnce(chatResult('Hi! How can I help?'));

    const doneId = await turnForB('hi', GUARDRAIL_ON);

    expect(doneId).not.toBe(sessionA);
    const [created] = await testDb.db.select().from(aiSessions).where(eq(aiSessions.id, doneId));
    expect(created.aiExperienceId).toBe(expB);
    expect(await messagesOf(sessionA)).toEqual(['assistant:A answer', 'user:A question']);
    expect(await messagesOf(doneId)).toContain('assistant:Hi! How can I help?');
    expect(JSON.stringify(mocks.chat.mock.calls)).not.toContain('A question');
  });
});

describe('a chat turn with its own experience\'s session id', () => {
  it('continues that conversation', async () => {
    scriptSearchTurn();

    const doneId = await turnFor(expA, 'Search for red shoes');

    expect(doneId).toBe(sessionA);
    const saved = await messagesOf(sessionA);
    expect(saved).toEqual(expect.arrayContaining(['user:A question', 'assistant:A answer', 'user:Search for red shoes']));
    // The model saw the earlier turn
    expect(JSON.stringify(mocks.chat.mock.calls)).toContain('A question');
  });
});
