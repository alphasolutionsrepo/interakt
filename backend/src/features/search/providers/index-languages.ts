// src/features/search/providers/index-languages.ts

/**
 * Index languages per search engine
 *
 * The one place that answers "which languages can this engine analyse text in?".
 * The create wizard, the edit page, the detail page and server-side validation all
 * ask here, so they cannot disagree.
 *
 * Client-safe: imports only constants modules, never a provider implementation.
 * Labels always come from ES_LANGUAGES, so a language reads the same on both engines.
 */

import { AZURE_LANGUAGE_ANALYZERS } from './azure-ai-search/azure-constants';
import { ES_LANGUAGES } from './elasticsearch/elasticsearch.constants';

export interface IndexLanguageOption {
    value: string;
    label: string;
}

const AZURE_PROVIDER = 'azure-ai-search';

/** Display names for the engines, for messages. */
const ENGINE_NAMES: Record<string, string> = {
    elasticsearch: 'Elasticsearch',
    [AZURE_PROVIDER]: 'Azure AI Search',
};

function isAzure(provider: string | null | undefined): boolean {
    return provider === AZURE_PROVIDER;
}

/**
 * The languages an index on this engine can use, in display order.
 * Any provider other than Azure AI Search gets the Elasticsearch list, the original engine.
 */
export function getIndexLanguages(provider: string | null | undefined): IndexLanguageOption[] {
    const all = ES_LANGUAGES.map(({ value, label }) => ({ value: value as string, label }));
    if (!isAzure(provider)) return all;
    return all.filter(({ value }) => Object.hasOwn(AZURE_LANGUAGE_ANALYZERS, value));
}

export function isIndexLanguageSupported(provider: string | null | undefined, value: string): boolean {
    return getIndexLanguages(provider).some(lang => lang.value === value);
}

export interface IndexLanguageChoices {
    options: IndexLanguageOption[];
    /** Set when the current value is not in the engine's list (older data): shown as the current value with this note. */
    currentNote?: string;
}

/**
 * What the language picker offers for an engine and the value stored now. A stored value
 * the engine's list lacks stays selectable as the current value, so the picker never
 * shows an empty select; the note says why it is not a normal choice.
 */
export function getIndexLanguageChoices(provider: string | null | undefined, current: string): IndexLanguageChoices {
    const options = getIndexLanguages(provider);
    if (!current || options.some(lang => lang.value === current)) return { options };
    return {
        options: [{ value: current, label: `${getIndexLanguageLabel(current) ?? current} (current)` }, ...options],
        currentNote: `${getIndexLanguageLabel(current) ?? current} isn't available on ${getIndexEngineName(provider)}. This index keeps running on it until you pick another language.`,
    };
}

/** The label for a stored language value, or undefined when the value is not a known language. */
export function getIndexLanguageLabel(value: string): string | undefined {
    return ES_LANGUAGES.find(lang => lang.value === value)?.label;
}

/** Display name of the engine, for messages. */
export function getIndexEngineName(provider: string | null | undefined): string {
    return ENGINE_NAMES[provider ?? ''] ?? ENGINE_NAMES.elasticsearch;
}

/** The message for a language the engine cannot use, e.g. "Language 'klingon' isn't available for Azure AI Search". */
export function unsupportedLanguageMessage(provider: string | null | undefined, value: string): string {
    return `Language '${value}' isn't available for ${getIndexEngineName(provider)}`;
}

/**
 * Whether the engine can apply custom stop words on top of the language's own.
 * Azure AI Search cannot: it does not allow them together with autocomplete.
 */
export function supportsCustomStopWords(provider: string | null | undefined): boolean {
    return !isAzure(provider);
}

/** Shown wherever custom stop words are disabled. */
/** One plain line under the language picker, on every screen that shows it */
export const INDEX_LANGUAGE_HINT =
    'The language your content is written in.';

export const CUSTOM_STOP_WORDS_UNSUPPORTED_REASON =
    "Custom stop words can't be applied on Azure AI Search because Azure doesn't allow them together with autocomplete. The language's own stop words still apply.";

/**
 * The language and stop words to carry over when the engine for a new index changes.
 * A language the new engine lacks goes back to the default; custom stop words are
 * cleared on an engine that can't apply them (their input is disabled there, so they
 * would otherwise be stuck in the form and refused by the server).
 */
export function reconcileSettingsForProvider(
    provider: string | null | undefined,
    settings: { language: string; stopWords: string[] },
): { language: string; stopWords: string[] } {
    return {
        language: isIndexLanguageSupported(provider, settings.language) ? settings.language : 'english',
        stopWords: supportsCustomStopWords(provider) ? settings.stopWords : [],
    };
}
