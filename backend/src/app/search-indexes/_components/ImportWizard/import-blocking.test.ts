// src/app/search-indexes/_components/ImportWizard/import-blocking.test.ts

import { describe, expect, it } from 'vitest';

import { importBlockingMessage } from './import-blocking';

describe('importBlockingMessage', () => {
    it('is the preview\'s blocking errors, so the wizard offers no Next', () => {
        expect(importBlockingMessage({ blockingErrors: ["Language 'cjk' isn't available for Azure AI Search"] }))
            .toBe("Language 'cjk' isn't available for Azure AI Search");
    });

    it('is nothing for a preview with no blocking errors, warnings or not', () => {
        expect(importBlockingMessage({ blockingErrors: [] })).toBeUndefined();
        expect(importBlockingMessage({})).toBeUndefined();
    });
});
