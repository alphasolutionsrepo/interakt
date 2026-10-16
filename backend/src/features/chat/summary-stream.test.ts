// src/features/chat/summary-stream.test.ts

/**
 * The summary prompt is read in full before the first word appears, so it carries
 * each result once: the title on its [n] line, not again as a field, and no ids.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/ai-service/ai-service.service', () => ({}));
vi.mock('@/features/telemetry', () => ({ ATTR: {}, flushTelemetry: vi.fn(), shouldLogContent: () => false, withSpan: vi.fn() }));
vi.mock('@/features/chat/prompt-builder', async (importOriginal) => importOriginal());

import { buildSummaryUserPrompt } from './summary-stream';

const result = (fields: Record<string, unknown>) => ({ id: 'x', index: { id: 'i', name: 'i' }, fields });

describe('buildSummaryUserPrompt', () => {
  it('lists each result once, without the title again or the id', () => {
    const prompt = buildSummaryUserPrompt('scholarships', [
      result({ id: 'https___www_example_edu_aid', name: 'Scholarships', description: 'Aid for students', url: 'https://example.edu/aid' }),
    ]);
    expect(prompt).toContain('[1] Scholarships\nDescription: Aid for students\nUrl: https://example.edu/aid');
    expect(prompt).not.toMatch(/^Name:/m);
    expect(prompt).not.toMatch(/^Id:/m);
  });

  it('keeps name when the title comes from a title field', () => {
    const prompt = buildSummaryUserPrompt('q', [result({ title: 'Linen shirt', name: 'SKU-1', price: 40 })]);
    expect(prompt).toContain('[1] Linen shirt\nName: SKU-1\nPrice: 40');
  });
});
