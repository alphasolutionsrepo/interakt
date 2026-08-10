// app/prompt-templates/_lib/template-variables.test.ts

import { describe, it, expect } from 'vitest';

import { referencedVariables, validateTemplateContent } from './template-variables';

import type { PromptVariable } from './api-client';

function declared(...names: string[]): PromptVariable[] {
  return names.map((name) => ({ name, description: name, source: 'pipeline_context' as const }));
}

describe('referencedVariables', () => {
  it('collects each placeholder once, in order of first appearance', () => {
    expect(referencedVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('tolerates surrounding whitespace', () => {
    expect(referencedVariables('{{  toolList  }}')).toEqual(['toolList']);
  });

  it('names the variable a conditional tests', () => {
    // A conditional on a misspelled variable is silently always-false — the same bug as a
    // misspelled placeholder, with a quieter failure.
    expect(referencedVariables('{{#if businessDomain}}x{{/if}}')).toEqual(['businessDomain']);
  });

  it('ignores control tokens that name nothing', () => {
    expect(referencedVariables('{{#if a}}x{{else}}y{{/if}}')).toEqual(['a']);
    expect(referencedVariables('{{/if}}{{else}}')).toEqual([]);
  });

  it('finds nothing in content with no placeholders', () => {
    expect(referencedVariables('Just prose.')).toEqual([]);
  });
});

describe('validateTemplateContent', () => {
  it('accepts content that uses only declared variables', () => {
    const result = validateTemplateContent('{{toolList}}', declared('toolList'));

    expect(result.unknown).toEqual([]);
    expect(result.unused).toEqual([]);
  });

  it('reports a misspelled variable', () => {
    // This renders as empty string at runtime: the prompt loses a whole block and the only
    // symptom is worse answers.
    const result = validateTemplateContent('{{toolLst}}', declared('toolList'));

    expect(result.unknown).toEqual(['toolLst']);
  });

  it('reports a declared variable the content never uses', () => {
    const result = validateTemplateContent('{{toolList}}', declared('toolList', 'dataContext'));

    expect(result.unused).toEqual(['dataContext']);
  });

  it('reports both at once', () => {
    const result = validateTemplateContent('{{toolLst}}', declared('toolList'));

    expect(result.unknown).toEqual(['toolLst']);
    expect(result.unused).toEqual(['toolList']);
  });

  it('counts a conditional as usage', () => {
    const result = validateTemplateContent(
      '{{#if businessDomain}}{{businessDomain}}{{/if}}',
      declared('businessDomain'),
    );

    expect(result.unused).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});
