import { describe, it, expect, vi, beforeEach } from 'vitest';

// The service pulls in the repository (and through it, the DB). Mock the
// repository so these are pure, DB-free unit tests of the service's response
// shaping.
vi.mock('./ai-experience.repository', () => ({
  listAIExperiences: vi.fn(),
}));

import * as repository from './ai-experience.repository';
import { listAIExperiences } from './ai-experience.service';
import type { ListAIExperiencesQuery } from './ai-experience.types';

const QUERY: ListAIExperiencesQuery = {
  page: 1,
  pageSize: 25,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

function experienceWithTopicGate() {
  return {
    id: 'exp-1',
    slug: 'support',
    name: 'Support',
    guardrailConfig: {
      inputGuardrail: {
        enabled: true,
        onBlock: { message: 'blocked' },
        rules: [
          {
            type: 'topic_gate',
            enabled: true,
            config: {
              allowedDomains: ['billing'],
              expandedTerms: ['invoice', 'refund'],
              termEmbeddings: [
                [0.1, 0.2, 0.3],
                [0.4, 0.5, 0.6],
              ],
              generalTerms: ['weather'],
              generalTermEmbeddings: [[0.7, 0.8, 0.9]],
              threshold: 0.5,
            },
          },
        ],
      },
      outputGuardrail: {
        enabled: false,
        onBlock: { message: 'blocked' },
        rules: [],
      },
    },
  };
}

describe('listAIExperiences (service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips topic-gate embedding vectors from the list response', async () => {
    vi.mocked(repository.listAIExperiences).mockResolvedValue({
      experiences: [experienceWithTopicGate()] as any,
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });

    const { experiences } = await listAIExperiences(QUERY);
    const ruleConfig = (experiences[0] as any).guardrailConfig.inputGuardrail.rules[0].config;

    // The byte-heavy embedding arrays are gone...
    expect(ruleConfig.termEmbeddings).toBeUndefined();
    expect(ruleConfig.generalTermEmbeddings).toBeUndefined();
    // ...but everything else the list/editor needs survives.
    expect(ruleConfig.expandedTerms).toEqual(['invoice', 'refund']);
    expect(ruleConfig.generalTerms).toEqual(['weather']);
    expect(ruleConfig.allowedDomains).toEqual(['billing']);
    expect(ruleConfig.threshold).toBe(0.5);
  });

  it('does not mutate the original repository result', async () => {
    const source = experienceWithTopicGate();
    vi.mocked(repository.listAIExperiences).mockResolvedValue({
      experiences: [source] as any,
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });

    await listAIExperiences(QUERY);

    // Detail/by-id/slug fetches share this row shape and must keep embeddings.
    expect(source.guardrailConfig.inputGuardrail.rules[0].config.termEmbeddings).toHaveLength(2);
  });

  it('passes through experiences with no guardrailConfig', async () => {
    vi.mocked(repository.listAIExperiences).mockResolvedValue({
      experiences: [{ id: 'exp-2', slug: 'x', name: 'X', guardrailConfig: null }] as any,
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });

    const { experiences } = await listAIExperiences(QUERY);
    expect((experiences[0] as any).guardrailConfig).toBeNull();
  });
});
