// src/app/search-indexes/_components/IndexLanguageSelect.test.ts

/**
 * The language picker offers the engine's list. The repo has no DOM test environment and
 * Radix Select renders its items only on the client, so the component (it has no hooks) is
 * called directly and its element tree is read: the select items and the note.
 */

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { IndexLanguageSelect } from './IndexLanguageSelect';

import { SelectItem } from '@/components/ui/select';


function walk(node: ReactNode, visit: (el: ReactElement<Record<string, unknown>>) => void): void {
    if (Array.isArray(node)) return node.forEach(n => walk(n, visit));
    if (!isValidElement<Record<string, unknown>>(node)) return;
    visit(node);
    walk(node.props.children as ReactNode, visit);
}

function render(provider: string, value: string) {
    const tree = IndexLanguageSelect({ provider, value, onChange: () => undefined });
    const items: { value: string; label: string }[] = [];
    const text: string[] = [];
    walk(tree, el => {
        if (el.type === SelectItem) items.push({ value: el.props.value as string, label: String(el.props.children) });
        if (el.type === 'p') text.push(String(el.props.children));
    });
    return { items, values: items.map(i => i.value), note: text[0] };
}

describe('IndexLanguageSelect', () => {
    it('offers Danish and Norwegian on Azure, and not CJK', () => {
        const { values } = render('azure-ai-search', 'danish');
        expect(values).toEqual(expect.arrayContaining(['danish', 'norwegian']));
        expect(values).not.toContain('cjk');
    });

    it('offers CJK on Elasticsearch', () => {
        expect(render('elasticsearch', 'english').values).toContain('cjk');
    });

    it('shows a stored value the engine lacks as the current value, with a note', () => {
        const { items, note } = render('azure-ai-search', 'cjk');
        expect(items[0]).toEqual({ value: 'cjk', label: 'CJK (Chinese, Japanese, Korean) (current)' });
        expect(note).toContain("isn't available on Azure AI Search");
    });

    it('shows no note for a value the engine has', () => {
        expect(render('azure-ai-search', 'danish').note).toBeUndefined();
    });
});
