// app/prompt-templates/_lib/template-variables.ts

/**
 * Validation for prompt template content against its declared variable catalog.
 *
 * `metadata.variables` has always described what a step provides, and nothing enforced it.
 * A typo renders as empty string at runtime: the prompt silently loses a whole block and the
 * only symptom is worse answers. Catching it at save time is the difference between a typo
 * and a mystery.
 *
 * Kept free of React so it can be tested directly — the rules are the valuable part, not the
 * textarea around them.
 */

import type { PromptVariable } from './api-client';

/** Handlebars-ish control tokens the pipeline's renderer understands. */
const CONTROL_TOKEN = /^(#if\s|\/if$|#each\s|\/each$|else$)/;

export interface TemplateValidation {
  /** Referenced but not declared — blocks a save, since it will render as nothing. */
  unknown: string[];
  /** Declared but never referenced — worth surfacing, not worth blocking. */
  unused: string[];
}

/**
 * Every `{{token}}` in the content, in first-appearance order, excluding control tokens.
 *
 * Conditionals name a variable too (`{{#if businessDomain}}`), so the name inside is
 * collected: a conditional on a misspelled variable is silently always-false, which is the
 * same class of bug with a quieter failure.
 */
export function referencedVariables(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/\{\{([^}]+)\}\}/g)) {
    const raw = match[1].trim();

    let name = raw;
    if (CONTROL_TOKEN.test(raw)) {
      // `#if businessDomain` → businessDomain; `/if` and `else` name nothing.
      const parts = raw.split(/\s+/);
      if (parts.length < 2) continue;
      name = parts[1];
    }

    if (!name || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }

  return found;
}

/** Compare content against the step's declared variables. */
export function validateTemplateContent(
  content: string,
  declared: PromptVariable[],
): TemplateValidation {
  const declaredNames = new Set(declared.map((v) => v.name));
  const referenced = referencedVariables(content);
  const referencedSet = new Set(referenced);

  return {
    unknown: referenced.filter((name) => !declaredNames.has(name)),
    unused: declared.map((v) => v.name).filter((name) => !referencedSet.has(name)),
  };
}
