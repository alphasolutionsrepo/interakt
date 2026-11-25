// src/app/search-indexes/_components/CreateWizard/StepSearchSettings.test.ts

/**
 * The create wizard's settings step. The repo has no DOM test environment, so the component
 * is called directly with React's hooks stubbed: state returns its initial value and effects
 * are collected and run by hand, which is what a render does. A "re-render" is another call
 * with new props.
 */

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => [] as Array<() => void>);
vi.mock('react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react')>()),
    useState: (initial: unknown) => [initial, () => undefined],
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void) => { effects.push(fn); },
}));
vi.mock('../providers', () => ({ getProviderUI: () => undefined }));

import { IndexLanguageSelect } from '../IndexLanguageSelect';
import { StopWordsUnavailableBadge, StopWordsUnavailableNotice } from '../StopWordsUnavailable';

import { StepSearchSettings } from './StepSearchSettings';

import { Input } from '@/components/ui/input';
import type { WizardFormData } from '@/features/search-index/search-index.wizard-schemas';



type El = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, match: (el: El) => boolean, out: El[] = []): El[] {
    if (Array.isArray(node)) { node.forEach(n => find(n, match, out)); return out; }
    if (!isValidElement<Record<string, unknown>>(node)) return out;
    if (match(node)) out.push(node);
    find(node.props.children as ReactNode, match, out);
    return out;
}

const updateField = vi.fn();
function render(formData: Partial<WizardFormData>) {
    effects.length = 0;
    const tree = StepSearchSettings({ formData: formData as WizardFormData, errors: {}, updateField: updateField as never });
    effects.forEach(run => run());
    return tree;
}

beforeEach(() => updateField.mockClear());

describe('the wizard settings step on Azure', () => {
    it('offers no stop word input and says why', () => {
        const tree = render({ searchProvider: 'azure-ai-search', language: 'danish', stopWords: [] });
        expect(find(tree, el => el.type === Input && el.props.placeholder === 'Words to exclude from indexing')).toHaveLength(0);
        expect(find(tree, el => el.type === StopWordsUnavailableNotice)).toHaveLength(1);
        expect(find(tree, el => el.type === StopWordsUnavailableBadge)).toHaveLength(1);
    });

    it('uses the shared language picker with the index provider', () => {
        const tree = render({ searchProvider: 'azure-ai-search', language: 'danish', stopWords: [] });
        expect(find(tree, el => el.type === IndexLanguageSelect)[0].props.provider).toBe('azure-ai-search');
    });

    it('clears stop words entered on Elasticsearch when the engine switches to Azure', () => {
        render({ searchProvider: 'elasticsearch', language: 'english', stopWords: ['the'] });
        expect(updateField).not.toHaveBeenCalled();

        render({ searchProvider: 'azure-ai-search', language: 'english', stopWords: ['the'] });
        expect(updateField).toHaveBeenCalledWith('stopWords', []);
    });

    it('resets a language Azure lacks when the engine switches', () => {
        render({ searchProvider: 'azure-ai-search', language: 'cjk', stopWords: [] });
        expect(updateField).toHaveBeenCalledWith('language', 'english');
    });
});

describe('the wizard settings step on Elasticsearch', () => {
    it('keeps the stop word input enabled and offers the picker with the ES provider', () => {
        const tree = render({ searchProvider: 'elasticsearch', language: 'cjk', stopWords: ['the'] });
        const input = find(tree, el => el.type === Input && el.props.placeholder === 'Words to exclude from indexing')[0];
        expect(input).toBeDefined();
        expect(find(tree, el => el.type === StopWordsUnavailableNotice)).toHaveLength(0);
        expect(find(tree, el => el.type === IndexLanguageSelect)[0].props.provider).toBe('elasticsearch');
        expect(updateField).not.toHaveBeenCalled();
    });
});
