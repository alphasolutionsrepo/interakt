// src/features/search-experience/query-rewriter.core.ts

/**
 * Query Rewriter — pure core
 *
 * For external sources: turns a visitor's question into search terms a site
 * search engine matches well.
 *
 *   "how do I apply for financial aid as a transfer student"
 *     → "apply financial aid transfer student"
 *
 * External engines have no fields we can filter on, so the rewrite only changes
 * the words. Prompt, parsing and gating live here; the model call, caching and
 * time limit live in query-interpreter.ts.
 */

/** Longest rewrite we accept. Anything longer is not search terms. */
export const MAX_REWRITE_LENGTH = 200;

/** Whether a query has enough words to be worth a rewrite. */
export function shouldRewrite(query: string, minWords: number): boolean {
    return query.trim().split(/\s+/).filter(Boolean).length >= minWords;
}

/** Instructions for rewriting a question into site-search terms. */
export function buildRewritePrompt(customInstructions?: string): string {
    let prompt = `You rewrite a visitor's question into search terms for a website's search engine.

## Rules
1. Keep the key nouns and qualifiers that say what the visitor is looking for.
2. Drop filler such as "how do I", "please", "can you tell me", "I want to know", "where can I find".
3. Do not add terms the visitor did not use or clearly mean. Do not guess at answers.
4. Keep names, codes, numbers and abbreviations exactly as typed.
5. Keep the visitor's language. Do not translate.
6. If the phrase already reads like search terms, return it unchanged.
7. Return only the search terms in "query", with no quotes or operators.`;

    if (customInstructions) {
        prompt += `\n\n## Additional instructions\n${customInstructions}`;
    }

    return prompt;
}

/** JSON schema for the model's structured response. */
export const REWRITE_SCHEMA = {
    type: 'object',
    properties: {
        query: {
            type: 'string',
            description: 'The search terms to send to the search engine',
        },
    },
    required: ['query'],
    additionalProperties: false,
} as const;

/**
 * Parse the model's reply into search terms.
 *
 * Returns null for anything unusable (bad JSON, empty, too long); the caller then
 * searches with the visitor's own words.
 */
export function parseRewrite(content: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const query = (parsed as { query?: unknown }).query;
    if (typeof query !== 'string') return null;

    const trimmed = query.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_REWRITE_LENGTH) return null;
    return trimmed;
}

/**
 * Characters the external engines' simple query syntax reads as syntax (Elasticsearch
 * simple_query_string, Azure AI Search simple): wildcards, OR, phrases, grouping,
 * fuzziness, the escape character, and "+" (AND, inside a word too: "linen+shirt").
 */
const SYNTAX_CHARACTERS = ['*', '|', '"', '(', ')', '~', '\\', '+'];
/** "-" means NOT only at the start of a word; inside one ("AB-12") it is part of the word. */
const NOT_SIGN = '-';
/** Words some engines read as operators when written in capitals. */
const OPERATOR_WORDS = ['OR', 'AND', 'NOT'];
/** Fuzziness or proximity with its number: "shirt~2", "\"linen shirt\"~3", "shirt~0.8". */
const FUZZINESS = /~[\d.]*/g;

/** Whether a word opens a group or phrase that it does not close itself. */
function opensGroup(word: string): boolean {
    const stripped = word.replace(/^[-+]+/, '');
    if (stripped.startsWith('(')) return !stripped.includes(')');
    if (stripped.startsWith('"')) return !stripped.slice(1).includes('"');
    return false;
}

/**
 * Keep search terms to plain words, as the prompt asks. A word the visitor typed, syntax
 * and all, stays as they typed it (their spelling, when the model only changed its capitals);
 * in any other word, search syntax is removed. A word the model excluded ("-used",
 * "NOT wool", a negated group or phrase) is dropped with its sign, so the search widens
 * rather than looking for what was meant to be left out.
 * Returns null when no words are left; the caller then searches with the visitor's own words.
 */
export function plainSearchTerms(terms: string, visitorQuery: string): string | null {
    const typed = visitorQuery.split(/\s+/).filter(Boolean);
    const visitorWords = new Set(typed);
    const visitorSpelling = new Map(typed.map((word) => [word.toLowerCase(), word]));
    const words: string[] = [];
    let negateNext = false;
    let insideNegatedGroup = false;
    for (const word of terms.split(/\s+/).filter(Boolean)) {
        if (insideNegatedGroup) {
            if (word.includes(')') || word.includes('"')) insideNegatedGroup = false;
            continue;
        }
        if (negateNext) {
            negateNext = false;
            insideNegatedGroup = opensGroup(word);
            continue;
        }
        if (visitorWords.has(word)) {
            words.push(word);
            continue;
        }
        if (word === 'NOT') {
            negateNext = true;
            continue;
        }
        if (OPERATOR_WORDS.includes(word)) continue;
        const asTyped = visitorSpelling.get(word.toLowerCase());
        if (asTyped !== undefined) {
            words.push(asTyped);
            continue;
        }
        if (word.replace(/^[+(]+/, '').startsWith(NOT_SIGN)) {
            insideNegatedGroup = opensGroup(word.replace(/^[+(]+/, ''));
            continue;
        }
        let plain = word.replace(FUZZINESS, ' ');
        for (const char of SYNTAX_CHARACTERS) plain = plain.split(char).join(' ');
        for (const piece of plain.split(/\s+/)) {
            const rest = piece.replace(/^-+/, '');
            if (rest.length > 0) words.push(rest);
        }
    }
    return words.length > 0 ? words.join(' ') : null;
}
