// src/app/search-indexes/_components/CustomStopWordsCard.test.ts

/**
 * The edit page's stop words card. On Azure there is no input, and the reason shows, but words
 * already stored stay listed with working remove buttons. No DOM test environment exists in
 * the repo, so the component (no hooks) is called directly and its element tree is read.
 */

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CustomStopWordsCard } from './CustomStopWordsCard';
import { StopWordsUnavailableBadge, StopWordsUnavailableNotice } from './StopWordsUnavailable';

import { Input } from '@/components/ui/input';


type El = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, match: (el: El) => boolean, out: El[] = []): El[] {
    if (Array.isArray(node)) { node.forEach(n => find(n, match, out)); return out; }
    if (!isValidElement<Record<string, unknown>>(node)) return out;
    if (match(node)) out.push(node);
    find(node.props.children as ReactNode, match, out);
    return out;
}

function render(provider: string, stopWords: string[], onRemove = vi.fn()) {
    const tree = CustomStopWordsCard({ provider, stopWords, modified: false, draft: 'x', onDraftChange: vi.fn(), onAdd: vi.fn(), onRemove });
    return {
        input: find(tree, el => el.type === Input)[0],
        removeButtons: find(tree, el => el.type === 'button'),
        reasons: find(tree, el => el.type === StopWordsUnavailableNotice),
        badges: find(tree, el => el.type === StopWordsUnavailableBadge),
    };
}

describe('CustomStopWordsCard', () => {
    it('on Azure offers no input and says why, next to the title and in a note', () => {
        const { input, reasons, badges } = render('azure-ai-search', []);
        expect(input).toBeUndefined();
        expect(reasons).toHaveLength(1);
        expect(badges).toHaveLength(1);
    });

    it('on Azure keeps stored words listed with enabled remove buttons', () => {
        const onRemove = vi.fn();
        const { removeButtons } = render('azure-ai-search', ['a', 'the', 'of'], onRemove);
        expect(removeButtons).toHaveLength(3);
        for (const button of removeButtons) expect(button.props.disabled).toBeUndefined();
        (removeButtons[2].props.onClick as () => void)();
        expect(onRemove).toHaveBeenCalledWith(2);
    });

    it('on Elasticsearch allows adding and shows no reason', () => {
        const { input, reasons, badges } = render('elasticsearch', ['a']);
        expect(input.props.disabled).toBeUndefined();
        expect(reasons).toHaveLength(0);
        expect(badges).toHaveLength(0);
    });
});
