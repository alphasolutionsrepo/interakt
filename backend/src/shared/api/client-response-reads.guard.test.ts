// src/shared/api/client-response-reads.guard.test.ts

/**
 * The admin reads our API's answers through handleApiResponse (or toApiError, before a
 * stream): the status is checked before the body is read. Calling .json() on a response
 * itself turns a gateway's HTML error page into "Unexpected token <", or an error into an
 * empty list, and drops the server's message, hint and request id.
 *
 * The source is read with the TypeScript parser, so the layout of the code doesn't matter.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

/** Client code: pages and components, and shared client code. Not the API routes, the helpers themselves, or tests */
const CLIENT_DIRS = [join(SRC, 'app'), join(SRC, 'shared')];
const NOT_CLIENT = [join(SRC, 'app', 'api'), join(SRC, 'shared', 'api'), join(SRC, 'shared', 'test')];

/** Reads of something other than our API, which has no error shape of its own: path → why */
const ALLOWED: Record<string, string> = {};

function sourceFiles(dir: string): string[] {
  if (NOT_CLIENT.includes(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Calls of .json() with no arguments, on anything: the line of each */
function jsonReads(source: string, fileName = 'file.ts'): number[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 0 &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'json'
    ) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

describe('the scanner', () => {
  it.each([
    ['an awaited read', `const body = await res.json();`],
    ['a read in a then', `fetch(url).then((r) => r.json());`],
    ['a read with a catch', `const body = await response.json().catch(() => ({}));`],
    ['a read in a component', `export function A() { useEffect(() => { fetch(u).then((r) => r.json()).then(set); }, []); return <div />; }`],
  ])('finds %s', (_shape, source) => {
    expect(jsonReads(source, 'file.tsx')).not.toEqual([]);
  });

  it.each([
    ['JSON.parse', `const body = JSON.parse(text);`],
    ['a reference without a call', `const read = response.json;`],
    ['a json answer with arguments', `return NextResponse.json({ ok: true });`],
  ])('passes %s', (_shape, source) => {
    expect(jsonReads(source)).toEqual([]);
  });
});

// Walks every client source file: run with the whole suite, that can take longer than
// the default 5 seconds
describe('client code', { timeout: 30_000 }, () => {
  const files = CLIENT_DIRS.flatMap(sourceFiles).map((path) => {
    const name = relative(SRC, path).split(sep).join('/');
    return { name, reads: jsonReads(readFileSync(path, 'utf8'), path) };
  });

  it('reads API responses through handleApiResponse, not .json()', () => {
    const reads = files.filter(({ name }) => !(name in ALLOWED)).flatMap(({ name, reads }) => reads.map((line) => `${name}:${line}`));
    expect(reads).toEqual([]);
  });

  it('allows only files that still read something else', () => {
    const stale = Object.keys(ALLOWED).filter((name) => !files.find((f) => f.name === name)?.reads.length);
    expect(stale).toEqual([]);
  });
});
