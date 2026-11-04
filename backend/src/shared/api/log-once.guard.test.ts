// src/shared/api/log-once.guard.test.ts

/**
 * apiResponse.error, apiResponse.refused and describeError log the failure they answer.
 * Code that also logs it writes the same failure twice, the second time without the
 * request id; pass what it was doing as the log context instead. Each failure line names
 * its operation, and an operation belongs to one file, so the line says what failed.
 *
 * The source is read with the TypeScript parser, so the layout of the code doesn't matter.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const LOGGER = /^(logger|log|\w+Logger|console)$/;

/** A call such as logger.error(...), named by the method it calls on what */
function calls(node: ts.Node, on: RegExp | string, methods: string[]): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const target = node.expression.expression;
  const name = ts.isIdentifier(target) ? target.text : undefined;
  return !!name && (typeof on === 'string' ? name === on : on.test(name)) && methods.includes(node.expression.name.text);
}

const logsFailure = (node: ts.Node, levels = ['error', 'warn']) => calls(node, LOGGER, levels);
const answersFailure = (node: ts.Node) =>
  calls(node, 'apiResponse', ['error', 'refused']) ||
  (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'describeError');

/** Whether anything in node (not counting functions declared inside it) matches */
function contains(node: ts.Node, match: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found || (n !== node && ts.isFunctionLike(n))) return;
    if (match(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** The statement is a log call, or returns or is an answer through apiResponse */
const isLogStatement = (s: ts.Statement) => ts.isExpressionStatement(s) && logsFailure(s.expression, ['error', 'warn', 'info']);
const isAnswer = (s: ts.Statement) =>
  (ts.isReturnStatement(s) && !!s.expression && answersFailure(s.expression)) ||
  (ts.isExpressionStatement(s) && contains(s, answersFailure));

/** The name a catch gives the failure it handles (catch (e), .catch((e) => ...)) */
function failureOf(node: ts.Node): string | undefined {
  const binding = ts.isCatchClause(node)
    ? node.variableDeclaration?.name
    : ts.isCallExpression(node)
      ? node.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a))?.parameters[0]?.name
      : undefined;
  return binding && ts.isIdentifier(binding) ? binding.text : undefined;
}

/**
 * A log call in a catch nested inside handler that is about that catch's own failure
 * (cleanup that failed), not the one handler answers.
 */
function inOwnCatch(log: ts.Node, handler: ts.Node, answered: string | undefined): boolean {
  for (let n = log.parent; n && n !== handler; n = n.parent) {
    if (ts.isCatchClause(n)) {
      const namesAnswered = !!answered && contains(log, (id) => ts.isIdentifier(id) && id.text === answered);
      return !namesAnswered;
    }
  }
  return false;
}

/** Places in a source where a failure is logged and answered too: the line of each */
function loggedTwice(source: string, fileName = 'file.ts'): number[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const at = (n: ts.Node) => file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;

  const visit = (node: ts.Node) => {
    // A catch block, or the callback of .catch(...)
    const handler = ts.isCatchClause(node)
      ? node.block
      : ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch'
        ? node.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a))?.body
        : undefined;
    if (handler && contains(handler, (n) => logsFailure(n) && !inOwnCatch(n, handler, failureOf(node))) && contains(handler, answersFailure)) {
      lines.push(at(node));
    }

    // Anywhere: a log line followed straight by the answer
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseClause(node)) {
      node.statements.forEach((s, i) => {
        const next = node.statements[i + 1];
        if (next && isLogStatement(s) && isAnswer(next)) lines.push(at(s));
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...new Set(lines)];
}

/** The string literals an expression can be: 'a', or either side of c ? 'a' : 'b' */
function literals(expression: ts.Expression): string[] {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isConditionalExpression(expression)) return [...literals(expression.whenTrue), ...literals(expression.whenFalse)];
  return [];
}

/**
 * The operations a source passes to apiResponse.error / refused / describeError, directly
 * or through a function of its own that takes the operation as a parameter (a helper
 * that maps errors to answers).
 */
function operationsNamed(source: string): string[] {
  const file = ts.createSourceFile('file.ts', source, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  // Functions of this file that answer a failure, with a parameter named operation
  const takesOperation = new Map<string, number>();
  const findHelpers = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body && contains(node.body, answersFailure)) {
      const at = node.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === 'operation');
      if (at >= 0) takesOperation.set(node.name.text, at);
    }
    ts.forEachChild(node, findHelpers);
  };
  findHelpers(file);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && takesOperation.has(node.expression.text)) {
      const arg = node.arguments[takesOperation.get(node.expression.text)!];
      if (arg) names.push(...literals(arg));
    }
    if (answersFailure(node)) {
      for (const arg of (node as ts.CallExpression).arguments) {
        if (!ts.isObjectLiteralExpression(arg)) continue;
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'operation') names.push(...literals(p.initializer));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/**
 * Answers that don't name their operation: the line of each. The name is written where
 * the answer is, as { operation: ... } (a helper passes on the one it takes).
 */
function unnamed(source: string): number[] {
  const file = ts.createSourceFile('file.ts', source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const names = (arg: ts.Expression) =>
    ts.isObjectLiteralExpression(arg) &&
    arg.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && p.name.text === 'operation');
  const visit = (node: ts.Node) => {
    if (answersFailure(node) && !(node as ts.CallExpression).arguments.some(names)) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

describe('the scanner', () => {
  it.each([
    ['a typed catch', `try { a(); } catch (error: unknown) { logger.error('x', error); return apiResponse.error(error); }`],
    ['a catch on one line', `try { a(); } catch (e) { logger.error('x', e); return apiResponse.error(e); }`],
    ['a brace in a string', `try { a(); } catch (e) {\n  const hint = 'close it with }';\n  logger.error(hint, e);\n  return apiResponse.error(e);\n}`],
    ['a .catch callback', `p.catch((e) => { logger.error('x', e); return apiResponse.error(e); });`],
    ['another logger name', `try { a(); } catch (e) { apiLogger.warn('x', e); return apiResponse.refused(e, r); }`],
    ['a stream error event', `try { a(); } catch (e) { logger.error('x', e); send(describeError(e)); }`],
    ['a helper that logs and answers', `function mapError(e: unknown) {\n  if (a) return apiResponse.notFound('m');\n  logger.error('x', e as Error);\n  return apiResponse.error(e);\n}`],
    ['the failure logged in a catch inside', `try { a(); } catch (e) {\n  try { await rollback(); } catch (r) { logger.error('write failed', e); }\n  return apiResponse.error(e, undefined, { operation: 'x' });\n}`],
    ['an info line before the answer', `function f(e: unknown) {\n  logger.info('blocked');\n  return apiResponse.refused(e, r);\n}`],
  ])('finds %s', (_shape, source) => {
    expect(loggedTwice(source)).not.toEqual([]);
  });

  it.each([
    ['a catch that only answers', `try { a(); } catch (e) { return apiResponse.error(e, undefined, { operation: 'x' }); }`],
    ['a catch that only logs', `try { a(); } catch (e) { logger.warn('x', e); }`],
    ['a log in a function declared inside the catch', `try { a(); } catch (e) { const later = () => logger.error('x'); return apiResponse.error(e); }`],
    ['a log line between other work', `function f() {\n  logger.info('start');\n  doWork();\n  return apiResponse.error(e);\n}`],
    ['a catch inside that logs a failure of its own', `try { a(); } catch (e) {\n  try { await record(); } catch (recordFailed) { logger.warn('could not record', recordFailed); }\n  return apiResponse.error(e, undefined, { operation: 'x' });\n}`],
  ])('passes %s', (_shape, source) => {
    expect(loggedTwice(source)).toEqual([]);
  });

  it('reads the operations passed to the answer', () => {
    expect(operationsNamed(`apiResponse.error(e, undefined, { operation: 'a' }); apiResponse.refused(e, r, { slug, operation: 'b' }); describeError(e, 500, { operation: 'c' });`)).toEqual(['a', 'b', 'c']);
  });

  it('finds an answer that names no operation', () => {
    expect(unnamed(`apiResponse.error(e);\napiResponse.refused(e, 'NOT_FOUND', { slug });\ndescribeError(e, 500, log);`)).toEqual([1, 2, 3]);
  });

  it('passes an answer that names its operation, or passes on the one it was given', () => {
    expect(unnamed(`apiResponse.error(e, undefined, { operation: 'a' }); describeError(e, 500, { slug, operation });`)).toEqual([]);
  });

  it('reads an operation kept in a variable no further: write it where the answer is', () => {
    expect(operationsNamed(`const log = { operation: 'a' }; apiResponse.error(e, undefined, { operation: log.operation });`)).toEqual([]);
  });

  it('reads the operations passed through a helper that answers', () => {
    const source = `function mapError(e: unknown, operation: string) { return apiResponse.error(e, undefined, { operation }); }
      mapError(e, 'a'); mapError(e, upload ? 'b' : 'c');`;
    expect(operationsNamed(source)).toEqual(['a', 'b', 'c']);
  });
});

describe('a failure an API answers', () => {
  const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), source: readFileSync(path, 'utf8') }));

  it('is logged once: nothing logs it and answers through apiResponse too', () => {
    const twice = files.flatMap(({ path, source }) => loggedTwice(source, path).map((line) => `${path}:${line}`));
    expect(twice).toEqual([]);
  });

  it('names what failed', () => {
    // response.ts is apiResponse itself, passing on what its caller named
    const missing = files
      .filter(({ path }) => path !== join('shared', 'api', 'response.ts'))
      .flatMap(({ path, source }) => unnamed(source).map((line) => `${path}:${line}`));
    expect(missing).toEqual([]);
  });

  it('names what failed: an operation belongs to one file', () => {
    const inFiles = new Map<string, Set<string>>();
    for (const { path, source } of files) {
      for (const operation of operationsNamed(source)) inFiles.set(operation, (inFiles.get(operation) ?? new Set()).add(path));
    }
    const shared = [...inFiles].filter(([, paths]) => paths.size > 1).map(([operation, paths]) => `${operation}: ${[...paths].join(', ')}`);
    expect(shared).toEqual([]);
  });
});
