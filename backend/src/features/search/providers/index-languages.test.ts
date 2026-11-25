// src/features/search/providers/index-languages.test.ts

/**
 * Index languages per engine: one list each, the same labels on both, every entry
 * backed by a real analysis on its engine, and the create wizard, edit page and detail
 * page reading that list instead of keeping their own.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { KnownAnalyzerNames } from '@azure/search-documents';
import { describe, expect, it } from 'vitest';

import { AZURE_LANGUAGE_ANALYZERS } from './azure-ai-search/azure-constants';
import { ES_LANGUAGE_ANALYSIS, ES_LANGUAGES } from './elasticsearch/elasticsearch.constants';
import {
    INDEX_LANGUAGE_HINT,
    getIndexLanguageChoices,
    getIndexLanguages,
    getIndexLanguageLabel,
    isIndexLanguageSupported,
    reconcileSettingsForProvider,
    supportsCustomStopWords,
    unsupportedLanguageMessage,
} from './index-languages';

const values = (provider: string) => getIndexLanguages(provider).map(l => l.value);

describe('the languages an engine offers', () => {
    it('include Danish and Norwegian on both engines', () => {
        for (const provider of ['elasticsearch', 'azure-ai-search']) {
            expect(values(provider)).toEqual(expect.arrayContaining(['danish', 'norwegian']));
            expect(getIndexLanguages(provider).find(l => l.value === 'danish')?.label).toBe('Danish');
            expect(getIndexLanguages(provider).find(l => l.value === 'norwegian')?.label).toBe('Norwegian (Bokmål)');
        }
    });

    it('label a language the same on both engines', () => {
        const es = new Map(getIndexLanguages('elasticsearch').map(l => [l.value, l.label]));
        for (const lang of getIndexLanguages('azure-ai-search')) {
            expect(es.get(lang.value)).toBe(lang.label);
        }
    });

    it('leave out the languages Azure has no analyzer for, and keep them on Elasticsearch', () => {
        for (const value of ['cjk', 'serbian', 'sorani']) {
            expect(isIndexLanguageSupported('elasticsearch', value)).toBe(true);
            expect(isIndexLanguageSupported('azure-ai-search', value)).toBe(false);
        }
    });

    it('refuse a language neither engine has', () => {
        expect(isIndexLanguageSupported('elasticsearch', 'klingon')).toBe(false);
        expect(isIndexLanguageSupported('azure-ai-search', 'klingon')).toBe(false);
        expect(isIndexLanguageSupported('azure-ai-search', 'constructor')).toBe(false);
    });

    it('name the language and the engine when refusing one', () => {
        expect(unsupportedLanguageMessage('azure-ai-search', 'klingon')).toBe("Language 'klingon' isn't available for Azure AI Search");
        expect(unsupportedLanguageMessage('elasticsearch', 'klingon')).toBe("Language 'klingon' isn't available for Elasticsearch");
    });
});

describe('every listed language maps to a real analysis', () => {
    it('on Elasticsearch: a table entry, or the plain standard analysis', () => {
        for (const value of values('elasticsearch')) {
            if (value === 'standard') continue;
            // cjk and serbian have no stemmer or stop list in core Elasticsearch; the table says so with an entry
            expect(ES_LANGUAGE_ANALYSIS, value).toHaveProperty(value);
        }
    });

    it('on Azure: a name the Azure SDK knows', () => {
        const known = new Set<string>(Object.values(KnownAnalyzerNames));
        for (const value of values('azure-ai-search')) {
            expect(known.has(AZURE_LANGUAGE_ANALYZERS[value]), `${value} -> ${AZURE_LANGUAGE_ANALYZERS[value]}`).toBe(true);
        }
    });

    it('on Azure: every table key is a language Elasticsearch lists too, so labels exist', () => {
        const esValues = new Set(ES_LANGUAGES.map(l => l.value as string));
        for (const key of Object.keys(AZURE_LANGUAGE_ANALYZERS)) expect(esValues.has(key), key).toBe(true);
    });

    it('uses the Microsoft analyzers for Danish, Norwegian and English', () => {
        expect(AZURE_LANGUAGE_ANALYZERS).toMatchObject({
            danish: 'da.microsoft',
            norwegian: 'nb.microsoft',
            english: 'en.microsoft',
            standard: 'standard.lucene',
        });
    });
});

describe('the language picker choices', () => {
    it('are the engine list when the stored value is in it', () => {
        const { options, currentNote } = getIndexLanguageChoices('azure-ai-search', 'danish');
        expect(options).toEqual(getIndexLanguages('azure-ai-search'));
        expect(currentNote).toBeUndefined();
    });

    it('keep a stored value the engine lacks as the current value, with a note', () => {
        const { options, currentNote } = getIndexLanguageChoices('azure-ai-search', 'cjk');
        expect(options[0]).toEqual({ value: 'cjk', label: 'CJK (Chinese, Japanese, Korean) (current)' });
        expect(options.slice(1)).toEqual(getIndexLanguages('azure-ai-search'));
        expect(currentNote).toContain("isn't available on Azure AI Search");
    });

    it('label a value by its language, falling back to the raw value', () => {
        expect(getIndexLanguageLabel('norwegian')).toBe('Norwegian (Bokmål)');
        expect(getIndexLanguageLabel('klingon')).toBeUndefined();
    });
});

describe('custom stop words', () => {
    it('are supported on Elasticsearch and not on Azure', () => {
        expect(supportsCustomStopWords('elasticsearch')).toBe(true);
        expect(supportsCustomStopWords('azure-ai-search')).toBe(false);
    });
});

// The create wizard and the stop words card are covered by behaviour tests (StepSearchSettings.test.ts,
// CustomStopWordsCard.test.ts, IndexLanguageSelect.test.ts). The edit and detail pages are too heavy to
// render without a DOM environment, so these two keep a source check.
describe('the edit and detail pages read the engine list', () => {
    const read = (file: string) => readFileSync(path.join(__dirname, '../../..', file), 'utf8');
    const edit = read('app/search-indexes/(pages)/[id]/edit/page.tsx');
    const detail = read('app/search-indexes/(pages)/[id]/page.tsx');

    it('the edit page uses the shared picker with the index provider, on every engine', () => {
        expect(edit).toMatch(/<IndexLanguageSelect[^>]*provider=\{searchIndex\.searchProvider\}/);
        expect(edit).not.toContain('ES_LANGUAGES');
        const card = edit.slice(edit.indexOf('<Languages ') - 400, edit.indexOf('<Languages '));
        expect(card).not.toContain('isElasticsearch');
    });

    it('the wizard and the edit page call it plain "Language"', () => {
        const wizard = read('app/search-indexes/_components/CreateWizard/StepSearchSettings.tsx');
        expect(wizard).not.toContain('Analysis Language');
        expect(edit).not.toContain('Language Settings');
    });

    it('both explain it with the same plain hint next to the label', () => {
        const wizard = read('app/search-indexes/_components/CreateWizard/StepSearchSettings.tsx');
        for (const source of [wizard, edit]) expect(source).toContain('<InfoHint content={INDEX_LANGUAGE_HINT}');
        expect(INDEX_LANGUAGE_HINT).not.toMatch(/stemm|analy/i);
    });

    it('the detail page shows the label, not the raw value', () => {
        expect(detail).toContain('getIndexLanguageLabel(');
        expect(detail).not.toContain("{searchIndex.language || 'English'}");
    });
});

describe('switching engine in the create wizard', () => {
    it('clears stop words and an unavailable language on Azure', () => {
        expect(reconcileSettingsForProvider('azure-ai-search', { language: 'cjk', stopWords: ['the'] })).toEqual({ language: 'english', stopWords: [] });
    });

    it('keeps a language Azure has and leaves Elasticsearch settings alone', () => {
        expect(reconcileSettingsForProvider('azure-ai-search', { language: 'danish', stopWords: [] })).toEqual({ language: 'danish', stopWords: [] });
        expect(reconcileSettingsForProvider('elasticsearch', { language: 'cjk', stopWords: ['the'] })).toEqual({ language: 'cjk', stopWords: ['the'] });
    });
});
