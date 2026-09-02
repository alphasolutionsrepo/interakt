import { describe, it, expect } from 'vitest';

import { formatFieldsForContext } from './prompt-builder';

describe('formatFieldsForContext — giving the summarizer real data to work with', () => {
    it('includes fields beyond title/content, like material', () => {
        // The bug this guards: a summarizer that only ever sees title/content
        // can't say anything about a product whose relevant data lives under a
        // different key, and will (correctly, per its own instructions) claim
        // that attribute doesn't exist.
        const result = formatFieldsForContext({
            name: 'Anchor & Pine Classic Casual Shirt',
            material: '100% cotton',
        });

        expect(result).toContain('Material: 100% cotton');
    });

    it('skips internal/meta fields prefixed with _', () => {
        const result = formatFieldsForContext({
            name: 'Test Product',
            _score: 12.3,
            _internalId: 'abc',
        });

        expect(result).not.toContain('_score');
        expect(result).not.toContain('_internalId');
    });

    it('skips null, undefined, and empty-string values', () => {
        const result = formatFieldsForContext({
            name: 'Test Product',
            description: null,
            brand: undefined,
            color: '',
        });

        expect(result).toBe('Name: Test Product');
    });

    it('truncates values over 500 characters', () => {
        const longText = 'x'.repeat(600);

        const result = formatFieldsForContext({ description: longText });

        expect(result).toBe(`Description: ${'x'.repeat(500)}...`);
    });

    it('formats camelCase and snake_case keys as readable Title Case labels', () => {
        const result = formatFieldsForContext({
            primaryColor: 'Blue',
            available_sizes: 'S, M, L',
        });

        expect(result).toContain('Primary Color: Blue');
        expect(result).toContain('Available sizes: S, M, L');
    });

    it('joins array values with commas', () => {
        const result = formatFieldsForContext({ tags: ['casual', 'summer', 'cotton'] });

        expect(result).toBe('Tags: casual, summer, cotton');
    });
});
