// src/shared/constants/embedding.constants.test.ts

/**
 * The embedding field's name is spelled out once: every engine and the indexing code
 * use EMBEDDING_FIELD_NAME, so the copies can't drift apart.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { EMBEDDING_FIELD_NAME } from './embedding.constants';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Whether a source has the name as a string in its code (comments don't count) */
function spellsOut(source: string): boolean {
  if (!source.includes(EMBEDDING_FIELD_NAME)) return false;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const isString = token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral;
    if (isString && scanner.getTokenValue() === EMBEDDING_FIELD_NAME) return true;
  }
  return false;
}

describe('the embedding field name', () => {
  it('is written as a string only where it is declared', () => {
    const spelledOut = sourceFiles(SRC)
      .filter((path) => spellsOut(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(spelledOut).toEqual([join('shared', 'constants', 'embedding.constants.ts')]);
  });
});
