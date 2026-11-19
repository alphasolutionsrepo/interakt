// src/shared/seeders/demo/demo-manifest.schema.test.ts

/**
 * The demo manifest keeps its free-form blocks (records of unknown, records of provider
 * options) as given, and rejects a block of the wrong shape with a field error.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

import { demoManifestSchema } from './demo-manifest';

const realManifest = () => YAML.parse(readFileSync(resolve(process.cwd(), 'setup/data/demo.manifest.yaml'), 'utf8'));

const minimal = () => ({
  demo: { key: 'd', name: 'Demo' },
  provider: {
    options: {
      ollama: { key: 'ollama', label: 'Ollama', defaults: { chatModel: 'c', textModel: 't', embeddingModel: 'e' } },
    },
  },
  index: { name: 'i', displayName: 'I', searchType: 'hybrid', mappingFile: 'm.json', documentsFile: 'd.json' },
  dataSource: { name: 'ds', slug: 'ds' },
  tools: { displayConfig: { preset: { nested: [1, 2] } } },
  searchExperience: { name: 's', slug: 's', searchConfig: { size: 10, facets: ['a'] } },
  chatExperience: { name: 'c', slug: 'c', persona: { tone: 'friendly', anything: { goes: true } }, access: { open: true } },
});

describe('demo manifest schema: free-form records', () => {
  it('accepts the real demo manifest and keeps its record fields as written', () => {
    const raw = realManifest();
    const parsed = demoManifestSchema.parse(raw);
    expect(parsed.chatExperience.persona).toEqual(raw.chatExperience.persona);
    expect(Object.keys(parsed.provider.options)).toEqual(Object.keys(raw.provider.options));
    expect(parsed.provider.options.ollama.defaults).toEqual(raw.provider.options.ollama.defaults);
  });

  it('keeps nested record contents untouched and fills the provider option defaults', () => {
    const parsed = demoManifestSchema.parse(minimal());
    expect(parsed.tools.displayConfig).toEqual({ preset: { nested: [1, 2] } });
    expect(parsed.searchExperience.searchConfig).toEqual({ size: 10, facets: ['a'] });
    expect(parsed.chatExperience.persona).toEqual({ tone: 'friendly', anything: { goes: true } });
    expect(parsed.provider.options.ollama).toMatchObject({ authType: 'none', requiredModels: [] });
  });

  it.each([
    ['a string', 'text', 'invalid_type'],
    ['an array', ['a'], 'invalid_type'],
  ])('rejects a record field given %s, naming the field', (_n, value, code) => {
    const input = minimal() as Record<string, any>;
    input.chatExperience.persona = value;
    const result = demoManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error!.issues).toEqual([expect.objectContaining({ code, path: ['chatExperience', 'persona'] })]);
  });

  it('rejects a provider option given as a string or array, naming its key', () => {
    for (const bad of ['ollama', ['x']]) {
      const input = minimal() as Record<string, any>;
      input.provider.options.ollama = bad;
      const result = demoManifestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error!.issues).toEqual([expect.objectContaining({ code: 'invalid_type', path: ['provider', 'options', 'ollama'] })]);
    }
  });
});
