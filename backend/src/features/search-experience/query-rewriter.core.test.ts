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
    plainSearchTerms,
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

describe('plainSearchTerms', () => {
    const VISITOR = 'what are the library opening hours on weekends';

    it('keeps plain search terms as they are', () => {
        expect(plainSearchTerms('library opening hours weekends', VISITOR)).toBe('library opening hours weekends');
        expect(plainSearchTerms('form AB-12 replacement', 'where is form AB-12')).toBe('form AB-12 replacement');
    });

    it('removes search syntax the model added', () => {
        expect(plainSearchTerms('"library hours" | weekend*', VISITOR)).toBe('library hours weekend');
        expect(plainSearchTerms('(library OR hours) +weekends ~2', VISITOR)).toBe('library hours weekends');
        expect(plainSearchTerms('library NOT AND hours', VISITOR)).toBe('library hours');
    });

    it('returns null when nothing but syntax is left', () => {
        expect(plainSearchTerms('*', VISITOR)).toBeNull();
        expect(plainSearchTerms(' | - " ', VISITOR)).toBeNull();
    });

    it('keeps the syntax the visitor typed themselves', () => {
        expect(plainSearchTerms('"financial aid" -loans', 'find "financial aid" -loans please')).toBe('"financial aid" -loans');
        expect(plainSearchTerms('research OR teaching awards', 'research OR teaching awards for staff')).toBe('research OR teaching awards');
        expect(plainSearchTerms('engineer*', 'jobs for engineer* graduates')).toBe('engineer*');
    });

    it('keeps syntax only on the words the visitor typed with it, not on words the model added', () => {
        // The visitor's quotes stay on their phrase; quotes and a wildcard the model added go
        expect(plainSearchTerms('"financial aid" "loans" grant*', 'find "financial aid" -loans please'))
            .toBe('"financial aid" loans grant');
        // A typed OR keeps that word, not one the model adds elsewhere
        expect(plainSearchTerms('research OR teaching OR awards', 'research OR teaching awards for staff')).toBe('research OR teaching OR awards');
    });

    it('removes a "+" the model put inside a word, which engines read as AND; keeps a hyphen inside one', () => {
        expect(plainSearchTerms('linen+shirt summer', 'any linen shirts for summer')).toBe('linen shirt summer');
        expect(plainSearchTerms('form AB-12 linen-blend', 'form AB-12 in a linen blend')).toBe('form AB-12 linen-blend');
        expect(plainSearchTerms('c++ courses', 'are there any c++ courses')).toBe('c++ courses');
    });

    it('removes an escape character the model added', () => {
        expect(plainSearchTerms('drive\\ error', 'why does my drive show an error')).toBe('drive error');
        expect(plainSearchTerms('C:\\ drive error', 'C:\\ drive error help')).toBe('C:\\ drive error');
    });

    it('keeps lower-case "or", "and" and "not": they are words, not operators', () => {
        expect(plainSearchTerms('black and white photos', 'show me black and white photos')).toBe('black and white photos');
    });

    it('drops a word the model excluded with its sign, so the search widens instead of looking for it', () => {
        expect(plainSearchTerms('shirts -used', 'shirts that are not used')).toBe('shirts');
        expect(plainSearchTerms('shirts NOT wool', 'shirts but not wool')).toBe('shirts');
        expect(plainSearchTerms('shirts (-wool) linen', 'linen shirts, no wool')).toBe('shirts linen');
        expect(plainSearchTerms('shirts +-wool', 'shirts without wool')).toBe('shirts');
    });

    it('drops a whole group or phrase the model excluded', () => {
        expect(plainSearchTerms('shirts NOT (wool OR silk) summer', 'summer shirts not wool or silk')).toBe('shirts summer');
        expect(plainSearchTerms('shirts -(wool silk) summer', 'summer shirts not wool or silk')).toBe('shirts summer');
        expect(plainSearchTerms('jackets -"faux leather" black', 'black jackets but not faux leather')).toBe('jackets black');
        expect(plainSearchTerms('jackets NOT "faux leather" black', 'black jackets but not faux leather')).toBe('jackets black');
    });

    it('keeps an exclusion the visitor typed themselves', () => {
        expect(plainSearchTerms('shirts -used', 'shirts -used')).toBe('shirts -used');
        expect(plainSearchTerms('shirts NOT wool', 'shirts NOT wool')).toBe('shirts NOT wool');
    });

    it("uses the visitor's spelling when the model only changed a word's capitals", () => {
        expect(plainSearchTerms('C++ books', 'any c++ books')).toBe('c++ books');
        expect(plainSearchTerms('Form ab-12', 'where is form AB-12')).toBe('form AB-12');
    });

    it('removes fuzziness and proximity with their number', () => {
        expect(plainSearchTerms('shirt~2 linen', 'linen shirt')).toBe('shirt linen');
        expect(plainSearchTerms('"linen shirt"~3 summer~0.8', 'summer linen shirt')).toBe('linen shirt summer');
    });
});
