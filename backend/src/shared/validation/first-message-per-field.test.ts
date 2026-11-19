// The create wizards show one message per field from a failed step (real wizard schemas, real zod).
import { describe, expect, it } from 'vitest';

import { firstMessagePerField } from './validation-messages';
import { z } from './zod';

import { wizardStep1Schema as experienceStep1 } from '@/features/search-experience/search-experience.wizard-schemas';
import { wizardStep1Schema as indexStep1 } from '@/features/search-index/search-index.wizard-schemas';

describe('firstMessagePerField', () => {
    it('maps a failed search-index wizard step to its top-level fields', () => {
        const result = indexStep1.safeParse({});
        expect(result.success).toBe(false);
        const messages = firstMessagePerField(result.error!.issues, { topLevel: true });
        expect(Object.keys(messages).length).toBeGreaterThan(0);
        for (const [field, message] of Object.entries(messages)) {
            expect(field).not.toContain('.');
            expect(message).toEqual(expect.any(String));
        }
    });

    it('maps a failed search-experience wizard step to field messages', () => {
        const result = experienceStep1.safeParse({});
        expect(result.success).toBe(false);
        const messages = firstMessagePerField(result.error!.issues);
        expect(Object.keys(messages).length).toBeGreaterThan(0);
    });

    it('keeps the first message for a field and dot-joins nested paths', () => {
        const schema = z.object({ name: z.string().min(3).regex(/^[a-z]+$/), sort: z.object({ order: z.enum(['asc', 'desc']) }) });
        const result = schema.safeParse({ name: 'A', sort: { order: 'up' } });
        expect(firstMessagePerField(result.error!.issues)).toEqual({
            name: 'Enter at least 3 characters.',
            'sort.order': 'Choose one of: "asc", "desc".',
        });
        expect(firstMessagePerField(result.error!.issues, { topLevel: true })).toEqual({
            name: 'Enter at least 3 characters.',
            sort: 'Choose one of: "asc", "desc".',
        });
    });
});
