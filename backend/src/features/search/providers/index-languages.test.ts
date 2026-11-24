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
    getIndexLanguageChoices,
    getIndexLanguages,
    getIndexLanguageLabel,
    isIndexLanguageSupported,
    supportsCustomStopWords,
    unsupportedLanguageMessage,
} from './index-languages';

const values = (provider: string) => getIndexLanguages(provider).map(l => l.value);

describe('the languages an engine offers', () => {
    it('include Danish and Norwegian on both engines', () => {
        for (const provider of ['elasticsearch', 'azure-ai-search']) {
            expect(values(provider)).toEqual(expect.arrayContaining(['danish', 'norwegian']));
            expect(getIndexLanguages(provider).find(l => l.value === 'danish')?.label).toBe('Danish');
            expect(getIndexLanguages(provider).find(l => l.value === 'norwegian')?.label).toBe('Norwegian');
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
        expect(getIndexLanguageLabel('norwegian')).toBe('Norwegian');
        expect(getIndexLanguageLabel('klingon')).toBeUndefined();
    });
});

describe('custom stop words', () => {
    it('are supported on Elasticsearch and not on Azure', () => {
        expect(supportsCustomStopWords('elasticsearch')).toBe(true);
        expect(supportsCustomStopWords('azure-ai-search')).toBe(false);
    });
});

describe('the pages read the engine list', () => {
    const read = (file: string) => readFileSync(path.join(__dirname, '../../..', file), 'utf8');
    const wizard = read('app/search-indexes/_components/CreateWizard/StepSearchSettings.tsx');
    const edit = read('app/search-indexes/(pages)/[id]/edit/page.tsx');
    const detail = read('app/search-indexes/(pages)/[id]/page.tsx');
    const picker = read('app/search-indexes/_components/IndexLanguageSelect.tsx');

    it('the wizard keeps no language list of its own', () => {
        expect(wizard).not.toMatch(/const LANGUAGES\b/);
        expect(wizard).not.toContain("value: 'english'");
    });

    it('the wizard and the edit page use the shared picker with the index provider', () => {
        expect(wizard).toMatch(/<IndexLanguageSelect[^>]*provider=\{provider\}/);
        expect(edit).toMatch(/<IndexLanguageSelect[^>]*provider=\{searchIndex\.searchProvider\}/);
        expect(edit).not.toContain('ES_LANGUAGES');
    });

    it('the picker takes its options from the engine list', () => {
        expect(picker).toContain('getIndexLanguageChoices(provider, value)');
    });

    it('the edit page shows the language card on every engine, not only Elasticsearch', () => {
        const card = edit.slice(edit.indexOf('Language Settings') - 400, edit.indexOf('Language Settings'));
        expect(card).not.toContain('isElasticsearch');
    });

    it('the detail page shows the label, not the raw value', () => {
        expect(detail).toContain('getIndexLanguageLabel(');
        expect(detail).not.toContain("{searchIndex.language || 'English'}");
    });
});
