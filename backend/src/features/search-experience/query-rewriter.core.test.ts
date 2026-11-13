// src/features/search-experience/query-rewriter.core.test.ts

/**
 * The search-terms rewrite for external sources: a site-search prompt (not the
 * shopping one), and a parser that refuses anything that isn't usable search terms.
 */

import { describe, expect, it } from 'vitest';

import {
    MAX_REWRITE_LENGTH,
    REWRITE_SCHEMA,
    buildRewritePrompt,
    parseRewrite,
    shouldRewrite,
} from './query-rewriter.core';

describe('buildRewritePrompt', () => {
    it('is written for website search, not shopping', () => {
        const prompt = buildRewritePrompt();
        expect(prompt).toContain("search terms for a website's search engine");
        expect(prompt).toContain('"how do I"');
        expect(prompt).toContain('Do not add terms');
        expect(prompt).toContain('exactly as typed');
        expect(prompt).toContain("Keep the visitor's language");
        expect(prompt).toContain('return it unchanged');
        expect(prompt).not.toMatch(/shopper|product|price/i);
        expect(prompt).not.toContain('Additional instructions');
    });

    it('appends the custom instructions', () => {
        const prompt = buildRewritePrompt('Course codes look like ABC-101.');
        expect(prompt).toMatch(/## Additional instructions\nCourse codes look like ABC-101\.$/);
    });
});

describe('REWRITE_SCHEMA', () => {
    it('asks for one query string', () => {
        expect(REWRITE_SCHEMA.required).toEqual(['query']);
        expect(Object.keys(REWRITE_SCHEMA.properties)).toEqual(['query']);
    });
});

describe('parseRewrite', () => {
    it('returns the trimmed search terms', () => {
        expect(parseRewrite('{"query":"  apply financial aid transfer student "}')).toBe('apply financial aid transfer student');
    });

    it('refuses bad JSON', () => {
        expect(parseRewrite('apply financial aid')).toBeNull();
        expect(parseRewrite('null')).toBeNull();
    });

    it('refuses a missing, non-string or empty query', () => {
        expect(parseRewrite('{}')).toBeNull();
        expect(parseRewrite('{"query":42}')).toBeNull();
        expect(parseRewrite('{"query":"   "}')).toBeNull();
    });

    it('refuses a query longer than the cap', () => {
        expect(parseRewrite(JSON.stringify({ query: 'a'.repeat(MAX_REWRITE_LENGTH) }))).toBe('a'.repeat(MAX_REWRITE_LENGTH));
        expect(parseRewrite(JSON.stringify({ query: 'a'.repeat(MAX_REWRITE_LENGTH + 1) }))).toBeNull();
    });
});

describe('shouldRewrite', () => {
    it('counts words against the minimum', () => {
        expect(shouldRewrite('financial aid', 3)).toBe(false);
        expect(shouldRewrite('  financial   aid deadlines ', 3)).toBe(true);
    });
});
