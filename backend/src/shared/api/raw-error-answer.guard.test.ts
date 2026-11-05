// src/shared/api/raw-error-answer.guard.test.ts

/**
 * A failure is answered through apiResponse or describeError, never with the caught
 * error's own text. That text can hold the SQL of a database error or a provider's
 * internals, and an answer built by hand has no request id or code. A message meant for
 * the user (the caller's own validation) is answered with apiResponse.badRequest or
 * refused, which say so.
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

function parse(source: string | ts.SourceFile, fileName = 'file.ts'): ts.SourceFile {
  return typeof source === 'string' ? ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true) : source;
}

/** e, (e), e as Error, e! all name the same value */
function bare(expression: ts.Expression): ts.Expression {
  let e = expression;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

/**
 * The expression is the caught error's text: e.message, (e as Error).message,
 * e instanceof Error ? e.message : '...', a template with one of those in it, or a
 * name the catch gave to one of those. caught holds the error's names (catch (error),
 * const err = error as Error).
 */
function isErrorText(expression: ts.Expression, caught: Set<string>, names: Set<string>): boolean {
  const e = bare(expression);
  if (ts.isIdentifier(e)) return names.has(e.text);
  if (ts.isPropertyAccessExpression(e)) {
    const target = bare(e.expression);
    return e.name.text === 'message' && ts.isIdentifier(target) && caught.has(target.text);
  }
  if (ts.isConditionalExpression(e)) return isErrorText(e.whenTrue, caught, names) || isErrorText(e.whenFalse, caught, names);
  if (ts.isTemplateExpression(e)) return e.templateSpans.some((span) => isErrorText(span.expression, caught, names));
  return false;
}

/** The name of what a call calls: json for NextResponse.json(...), emit for emit(...) */
function calleeName(call: ts.CallExpression | ts.NewExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** Calls that put what they are given in an answer: a JSON response, or an event of a stream */
const SENDS = new Set(['json', 'stringify', 'enqueue', 'encode', 'emit', 'send', 'sseEvent', 'onEvent']);
/** Responses built with new */
const RESPONSES = new Set(['Response', 'NextResponse']);

/** apiResponse.error('text') and describeError('text') show a string as it is */
function answersText(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'describeError';
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'apiResponse' &&
    ['error', 'internalError'].includes(callee.name.text)
  );
}

/** An { error: ... } or { message: ... } in what is sent that holds the caught error's text */
function sendsErrorText(value: ts.Expression, caught: Set<string>, names: Set<string>): boolean {
  const e = bare(value);
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.some((p) => {
      if (ts.isPropertyAssignment(p)) {
        const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
        if ((key === 'error' || key === 'message') && isErrorText(p.initializer, caught, names)) return true;
        return sendsErrorText(p.initializer, caught, names);
      }
      if (ts.isShorthandPropertyAssignment(p)) return (p.name.text === 'error' || p.name.text === 'message') && names.has(p.name.text);
      if (ts.isSpreadAssignment(p)) return sendsErrorText(p.expression, caught, names);
      return false;
    });
  }
  if (ts.isArrayLiteralExpression(e)) return e.elements.some((el) => sendsErrorText(el, caught, names));
  if (ts.isCallExpression(e)) return e.arguments.some((a) => sendsErrorText(a, caught, names));
  if (ts.isTemplateExpression(e)) return e.templateSpans.some((span) => sendsErrorText(span.expression, caught, names));
  return false;
}

/** The name a catch gives the failure it handles (catch (e), .catch((e) => ...)), and its body */
function caughtBy(node: ts.Node): { caught: string; body: ts.Node } | undefined {
  if (ts.isCatchClause(node)) {
    const name = node.variableDeclaration?.name;
    return name && ts.isIdentifier(name) ? { caught: name.text, body: node.block } : undefined;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch') {
    const callback = node.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    const name = callback?.parameters[0]?.name;
    return callback && name && ts.isIdentifier(name) ? { caught: name.text, body: callback.body } : undefined;
  }
  return undefined;
}

/** Places in a source that answer with a caught error's own text: the line of each */
function rawErrorAnswers(source: string | ts.SourceFile): number[] {
  const file = parse(source);
  const lines = new Set<number>();
  const at = (n: ts.Node) => file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;

  const visit = (node: ts.Node) => {
    const handler = caughtBy(node);
    if (handler) {
      const { body } = handler;
      // Other names the catch gives the error (const err = error as Error) and its text
      // (const message = e instanceof Error ? e.message : '...')
      const caught = new Set([handler.caught]);
      const names = new Set<string>();
      const collect = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
          const value = bare(n.initializer);
          if (ts.isIdentifier(value) && caught.has(value.text)) caught.add(n.name.text);
          else if (isErrorText(value, caught, names)) names.add(n.name.text);
        }
        ts.forEachChild(n, collect);
      };
      collect(body);

      const check = (n: ts.Node) => {
        // A catch inside handles a failure of its own
        if (n !== body && caught.has(caughtBy(n)?.caught ?? '')) return;
        if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
          const args = n.arguments ?? [];
          const name = calleeName(n);
          const sends = ts.isNewExpression(n) ? !!name && RESPONSES.has(name) : !!name && SENDS.has(name);
          if (sends && args.some((a) => sendsErrorText(a, caught, names))) lines.add(at(n));
          if (ts.isCallExpression(n) && answersText(n) && args[0] && isErrorText(args[0], caught, names)) lines.add(at(n));
        }
        ts.forEachChild(n, check);
      };
      check(body);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...lines];
}

/**
 * Files allowed to answer with an error's text, and why. The text there is the
 * caller's own, not ours.
 */
const ALLOWED: Record<string, string> = {};

describe('the scanner', () => {
  it.each([
    ['a JSON response', `try { a(); } catch (err) { return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 }); }`],
    ['a message property', `try { a(); } catch (e) { return NextResponse.json({ message: e.message }); }`],
    ['the error under another name', `try { a(); } catch (error) {\n  const err = error as Error;\n  return NextResponse.json({ error: err.message }, { status: 500 });\n}`],
    ['instanceof', `try { a(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }); }`],
    ['a name for the text', `try { a(); } catch (error) {\n  const message = error instanceof Error ? error.message : 'x';\n  return NextResponse.json({ error: message });\n}`],
    ['a shorthand name', `try { a(); } catch (e) {\n  const message = (e as Error).message;\n  return Response.json({ message });\n}`],
    ['a template', 'try { a(); } catch (e) { return NextResponse.json({ error: `Failed: ${(e as Error).message}` }); }'],
    ['a new Response', `try { a(); } catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 }); }`],
    ['a stream event', `try { a(); } catch (e) { emit({ type: 'error', error: (e as Error).message }); }`],
    ['an encoded event', 'try { a(); } catch (e) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (e as Error).message })}\\n\\n`)); }'],
    ['a .catch callback', `p.catch((e) => NextResponse.json({ error: e.message }));`],
    ['the text passed to apiResponse.error', `try { a(); } catch (e) { return apiResponse.error(e instanceof Error ? e.message : 'x', 500, { operation: 'x' }); }`],
  ])('finds %s', (_shape, source) => {
    expect(rawErrorAnswers(source)).not.toEqual([]);
  });

  it.each([
    ['the error passed to apiResponse', `try { a(); } catch (e) { return apiResponse.error(e, 500, { operation: 'x' }); }`],
    ['a refusal with the error', `try { a(); } catch (e) { return apiResponse.refused(e, 'NOT_FOUND', { operation: 'x' }); }`],
    ['a stream event described', `try { a(); } catch (e) { emit({ type: 'error', ...describeError(e, 500, { operation: 'x' }).body }); }`],
    ['a refusal with the caller\'s own message', `try { a(); } catch (e) { if (e instanceof PeriodError) return apiResponse.badRequest(e.message); }`],
    ['a message of our own', `try { a(); } catch (e) { return NextResponse.json({ error: 'Something failed' }, { status: 500 }); }`],
    ['the text in a log line', `try { a(); } catch (e) { logger.warn('x', { error: (e as Error).message }); return apiResponse.error(e, 500, { operation: 'x' }); }`],
    ['the text of another error', `try { a(); } catch (e) { return NextResponse.json({ error: other.message }); }`],
    ['a message outside a catch', `function f(e: Error) { return NextResponse.json({ error: e.message }); }`],
    ['a catch inside that reuses the name', `try { a(); } catch (e) {\n  try { b(); } catch (e) { logger.warn('x', e); }\n  return apiResponse.error(e, 500, { operation: 'x' });\n}`],
  ])('passes %s', (_shape, source) => {
    expect(rawErrorAnswers(source)).toEqual([]);
  });
});

// Each check walks every source file: run with the whole suite, that can take longer
// than the default 5 seconds
describe('a failure an API answers', { timeout: 30_000 }, () => {
  const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), source: parse(readFileSync(path, 'utf8'), path) }));
  const found = new Map(files.map(({ path, source }) => [path, rawErrorAnswers(source)] as const).filter(([, lines]) => lines.length > 0));

  it('is answered without the error text: through apiResponse or describeError', () => {
    const raw = [...found].filter(([path]) => !(path in ALLOWED)).flatMap(([path, lines]) => lines.map((line) => `${path}:${line}`));
    expect(raw).toEqual([]);
  });

  it('allows the error text only where it still is: a file that no longer has it comes off the list', () => {
    expect(Object.keys(ALLOWED).filter((path) => !found.has(path))).toEqual([]);
  });
});
