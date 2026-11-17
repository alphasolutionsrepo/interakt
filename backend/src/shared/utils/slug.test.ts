import { describe, it, expect } from 'vitest';

import { generateSlugFromName, SLUG_MAX_LENGTH } from './slug';
import { createAIExperienceSchema } from '@/features/ai-experience/ai-experience.validation';
import { createToolSchema } from '@/features/tools/tools.validation';
import { createDataSourceSchema } from '@/features/data-source/data-source.validation';
import { createMcpConnectionSchema } from '@/features/mcp-connection/mcp-connection.validation';
import { slugSchema } from '@/features/search-experience/search-experience.schemas';

// The slug rule shared by tools, data sources, MCP connections and AI experiences.
const SERVER_SLUG_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('generateSlugFromName', () => {
  it('trims leading punctuation and spaces', () => {
    expect(generateSlugFromName(' Foo!')).toBe('foo');
    expect(generateSlugFromName('!!Foo')).toBe('foo');
  });

  it('trims trailing punctuation', () => {
    expect(generateSlugFromName('Foo Bar!!!')).toBe('foo-bar');
    expect(generateSlugFromName('Foo - ')).toBe('foo');
  });

  it('collapses repeated separators', () => {
    expect(generateSlugFromName('a   b---c -- d')).toBe('a-b-c-d');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(generateSlugFromName(' !!! ')).toBe('');
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = generateSlugFromName(`${'a'.repeat(99)} b`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toBe('a'.repeat(99));
  });

  it('old wizard logic produced a slug the server rejects', () => {
    const oldGenerate = (n: string) =>
      n.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100);
    expect(oldGenerate(' Foo!')).toBe('-foo');
    expect(SERVER_SLUG_RULE.test(oldGenerate(' Foo!'))).toBe(false);
    expect(SERVER_SLUG_RULE.test(generateSlugFromName(' Foo!'))).toBe(true);
  });
});

describe('generated slugs pass each entity slug schema', () => {
  const names = [' Foo!', 'My Tool -', '--Docs  Search--', 'Étoile Café 2', 'x'.repeat(150), 'A - B - C'];

  it.each(names)('rule used by tools, data sources, MCP, AI experiences: %s', (name) => {
    const slug = generateSlugFromName(name);
    expect(slug).toMatch(SERVER_SLUG_RULE);
    const shape = (s: { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }) => s.shape.slug;
    expect(shape(createAIExperienceSchema as never).safeParse(slug).success).toBe(true);
    expect(shape(createMcpConnectionSchema as never).safeParse(slug).success).toBe(true);
    const ds = (createDataSourceSchema as unknown as { options: { shape: { slug: { safeParse: (v: unknown) => { success: boolean } } } }[] }).options[0];
    expect(ds.shape.slug.safeParse(slug).success).toBe(true);
    const tool = (createToolSchema as unknown as { options: { shape: { slug: { safeParse: (v: unknown) => { success: boolean } } } }[] }).options[0];
    expect(tool.shape.slug.safeParse(slug).success).toBe(true);
    expect(shape(createAIExperienceSchema as never).safeParse('-foo').success).toBe(false);
  });

  it.each(names)('search experience slugSchema (starts with a letter): %s', (name) => {
    const slug = generateSlugFromName(name);
    // Names starting with a digit or with no letters are a separate, pre-existing rule.
    if (/^[a-z]/.test(slug) && slug.length >= 3) {
      expect(slugSchema.safeParse(slug).success).toBe(true);
    }
  });
});
