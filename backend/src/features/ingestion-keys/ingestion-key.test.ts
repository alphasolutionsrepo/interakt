import { describe, it, expect } from 'vitest';
import {
    parseKey,
    hashSecret,
    secretMatchesHash,
    generateKeyMaterial,
    evaluateKeyAccess,
    toSummary,
} from './ingestion-key.service';
import {
    createIngestionKeyRequestSchema,
    ingestionKeyIdParamSchema,
} from './ingestion-key.validation';
import type { IngestionKeyWithIndexes, IngestionOperation } from './ingestion-key.types';

// ============================================================================
// HELPERS
// ============================================================================

const INDEX_A = '11111111-1111-1111-1111-111111111111';
const INDEX_B = '22222222-2222-2222-2222-222222222222';

function key(overrides: {
    operations?: IngestionOperation[];
    searchIndexIds?: string[];
    revokedAt?: Date | null;
    expiresAt?: Date | null;
} = {}): IngestionKeyWithIndexes {
    return {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Storyblok sink (EN)',
        keyPrefix: 'ik_abc12345',
        keyHash: hashSecret('secret'),
        operations: overrides.operations ?? ['write', 'delete'],
        searchIndexIds: overrides.searchIndexIds ?? [INDEX_A],
        revokedAt: overrides.revokedAt ?? null,
        expiresAt: overrides.expiresAt ?? null,
        lastUsedAt: null,
        createdBy: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as IngestionKeyWithIndexes;
}

// ============================================================================
// KEY FORMAT
// ============================================================================

describe('generateKeyMaterial', () => {
    it('produces a parseable key whose parts agree', () => {
        const material = generateKeyMaterial();
        const parsed = parseKey(material.plaintextKey);

        expect(parsed).not.toBeNull();
        expect(parsed!.keyPrefix).toBe(material.keyPrefix);
        expect(parsed!.secret).toBe(material.secret);
    });

    it('round-trips through the stored hash', () => {
        const material = generateKeyMaterial();

        expect(secretMatchesHash(material.secret, material.keyHash)).toBe(true);
    });

    it('does not leave the secret recoverable from the stored hash', () => {
        const material = generateKeyMaterial();

        expect(material.keyHash).not.toContain(material.secret);
        // SHA-256 hex
        expect(material.keyHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is unique across calls', () => {
        const prefixes = new Set(
            Array.from({ length: 50 }, () => generateKeyMaterial().keyPrefix)
        );

        expect(prefixes.size).toBe(50);
    });

    it('round-trips every time, including secrets containing underscores', () => {
        // Regression: the secret is base64url, whose alphabet includes '_'. An
        // earlier format split on every underscore, so any key whose secret
        // happened to contain one failed to parse — intermittently, and only in
        // production. 200 samples makes a '_' in the 43-char secret near-certain.
        for (let i = 0; i < 200; i++) {
            const material = generateKeyMaterial();
            const parsed = parseKey(material.plaintextKey);

            expect(parsed, `failed to parse ${material.plaintextKey}`).not.toBeNull();
            expect(parsed!.keyPrefix).toBe(material.keyPrefix);
            expect(parsed!.secret).toBe(material.secret);
            expect(secretMatchesHash(parsed!.secret, material.keyHash)).toBe(true);
        }
    });

    it('never puts a separator in the prefix', () => {
        for (let i = 0; i < 200; i++) {
            const { keyPrefix } = generateKeyMaterial();
            // 'ik_' plus a hex body — exactly one separator
            expect(keyPrefix.split('_')).toHaveLength(2);
            expect(keyPrefix).toMatch(/^ik_[0-9a-f]+$/);
        }
    });

    it('carries the ik_ marker so a key is recognisable on sight', () => {
        // Distinguishes it from a search access token, which is a bare UUID
        expect(generateKeyMaterial().plaintextKey.startsWith('ik_')).toBe(true);
    });
});

describe('parseKey', () => {
    it('splits a well-formed key, keeping the marker on the prefix', () => {
        const parsed = parseKey('ik_abc12345_thesecretpart');

        expect(parsed).toEqual({ keyPrefix: 'ik_abc12345', secret: 'thesecretpart' });
    });

    it('tolerates surrounding whitespace', () => {
        expect(parseKey('  ik_abc12345_thesecretpart  ')).not.toBeNull();
    });

    it('keeps underscores in the secret rather than splitting on them', () => {
        const parsed = parseKey('ik_abc12345_secret_with_underscores');

        expect(parsed).toEqual({
            keyPrefix: 'ik_abc12345',
            secret: 'secret_with_underscores',
        });
    });

    it.each([
        ['an empty string', ''],
        ['whitespace only', '   '],
        ['no separators', 'ikabc12345thesecret'],
        ['only one separator', 'ik_abc12345'],
        ['the wrong marker', 'sk_abc12345_thesecret'],
        ['an empty prefix', 'ik__thesecret'],
        ['an empty secret', 'ik_abc12345_'],
        ['a non-hex prefix', 'ik_notHexPrefix_thesecret'],
        ['a bare UUID (a search access token)', '550e8400-e29b-41d4-a716-446655440000'],
    ])('returns null for %s', (_label, input) => {
        expect(parseKey(input)).toBeNull();
    });
});

describe('secretMatchesHash', () => {
    it('rejects a wrong secret', () => {
        const material = generateKeyMaterial();

        expect(secretMatchesHash('not-the-secret', material.keyHash)).toBe(false);
    });

    it('rejects an empty secret', () => {
        const material = generateKeyMaterial();

        expect(secretMatchesHash('', material.keyHash)).toBe(false);
    });

    it('rejects a truncated stored hash rather than throwing', () => {
        // timingSafeEqual throws on length mismatch — this must be handled
        expect(() => secretMatchesHash('secret', 'abc')).not.toThrow();
        expect(secretMatchesHash('secret', 'abc')).toBe(false);
    });
});

// ============================================================================
// AUTHORIZATION
// ============================================================================

describe('evaluateKeyAccess — lifecycle', () => {
    it('allows a live key', () => {
        const result = evaluateKeyAccess(key(), { searchIndexId: INDEX_A });

        expect(result.success).toBe(true);
    });

    it('refuses a revoked key', () => {
        const result = evaluateKeyAccess(
            key({ revokedAt: new Date('2026-01-02T00:00:00Z') }),
            { searchIndexId: INDEX_A }
        );

        expect(result).toEqual({ success: false, reason: 'revoked' });
    });

    it('refuses an expired key', () => {
        const result = evaluateKeyAccess(
            key({ expiresAt: new Date('2026-01-02T00:00:00Z') }),
            { searchIndexId: INDEX_A },
            new Date('2026-06-01T00:00:00Z')
        );

        expect(result).toEqual({ success: false, reason: 'expired' });
    });

    it('allows a key whose expiry is still in the future', () => {
        const result = evaluateKeyAccess(
            key({ expiresAt: new Date('2026-12-31T00:00:00Z') }),
            { searchIndexId: INDEX_A },
            new Date('2026-06-01T00:00:00Z')
        );

        expect(result.success).toBe(true);
    });

    it('treats expiry as inclusive — a key expiring now is expired', () => {
        const at = new Date('2026-06-01T00:00:00Z');
        const result = evaluateKeyAccess(
            key({ expiresAt: at }),
            { searchIndexId: INDEX_A },
            at
        );

        expect(result).toEqual({ success: false, reason: 'expired' });
    });

    it('checks revocation before expiry', () => {
        const result = evaluateKeyAccess(
            key({ revokedAt: new Date('2026-01-02T00:00:00Z'), expiresAt: new Date('2026-01-03T00:00:00Z') }),
            { searchIndexId: INDEX_A },
            new Date('2026-06-01T00:00:00Z')
        );

        expect(result).toEqual({ success: false, reason: 'revoked' });
    });
});

describe('evaluateKeyAccess — index scope', () => {
    it('refuses an index the key was not granted', () => {
        const result = evaluateKeyAccess(
            key({ searchIndexIds: [INDEX_A] }),
            { searchIndexId: INDEX_B }
        );

        expect(result).toEqual({ success: false, reason: 'index-forbidden' });
    });

    it('allows any of several granted indexes', () => {
        const scoped = key({ searchIndexIds: [INDEX_A, INDEX_B] });

        expect(evaluateKeyAccess(scoped, { searchIndexId: INDEX_A }).success).toBe(true);
        expect(evaluateKeyAccess(scoped, { searchIndexId: INDEX_B }).success).toBe(true);
    });

    it('refuses a key with no grants at all', () => {
        const result = evaluateKeyAccess(
            key({ searchIndexIds: [] }),
            { searchIndexId: INDEX_A }
        );

        expect(result).toEqual({ success: false, reason: 'index-forbidden' });
    });

    it('checks index scope before operation', () => {
        // Otherwise the error would reveal that the operation was the only problem,
        // implying the key does reach that index
        const result = evaluateKeyAccess(
            key({ searchIndexIds: [INDEX_A], operations: ['write'] }),
            { searchIndexId: INDEX_B, operation: 'delete' }
        );

        expect(result).toEqual({ success: false, reason: 'index-forbidden' });
    });
});

describe('evaluateKeyAccess — operations', () => {
    it('allows a granted operation', () => {
        const result = evaluateKeyAccess(
            key({ operations: ['write'] }),
            { searchIndexId: INDEX_A, operation: 'write' }
        );

        expect(result.success).toBe(true);
    });

    it('refuses delete for a write-only key', () => {
        const result = evaluateKeyAccess(
            key({ operations: ['write'] }),
            { searchIndexId: INDEX_A, operation: 'delete' }
        );

        expect(result).toEqual({ success: false, reason: 'operation-forbidden' });
    });

    it('refuses write for a delete-only key', () => {
        const result = evaluateKeyAccess(
            key({ operations: ['delete'] }),
            { searchIndexId: INDEX_A, operation: 'write' }
        );

        expect(result).toEqual({ success: false, reason: 'operation-forbidden' });
    });

    it('allows reads with no operation required, whatever the grants', () => {
        // Being scoped to the index is sufficient to read from it
        const result = evaluateKeyAccess(
            key({ operations: [] }),
            { searchIndexId: INDEX_A }
        );

        expect(result.success).toBe(true);
    });

    it('refuses a mutating operation when the key grants none', () => {
        const result = evaluateKeyAccess(
            key({ operations: [] }),
            { searchIndexId: INDEX_A, operation: 'write' }
        );

        expect(result).toEqual({ success: false, reason: 'operation-forbidden' });
    });
});

// ============================================================================
// DISPLAY SHAPE
// ============================================================================

describe('toSummary', () => {
    it('never exposes the hash', () => {
        const summary = toSummary(key()) as unknown as Record<string, unknown>;

        expect(summary.keyHash).toBeUndefined();
        expect(Object.keys(summary)).not.toContain('keyHash');
    });

    it('exposes the prefix, which is safe to display', () => {
        expect(toSummary(key()).keyPrefix).toBe('ik_abc12345');
    });

    it('marks a live key active', () => {
        expect(toSummary(key()).isActive).toBe(true);
    });

    it('marks a revoked key inactive', () => {
        expect(toSummary(key({ revokedAt: new Date('2026-01-02T00:00:00Z') })).isActive).toBe(false);
    });

    it('marks a past-expiry key inactive', () => {
        expect(toSummary(key({ expiresAt: new Date('2020-01-01T00:00:00Z') })).isActive).toBe(false);
    });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('createIngestionKeyRequestSchema', () => {
    it('accepts a minimal request', () => {
        const result = createIngestionKeyRequestSchema.safeParse({
            name: 'Storyblok sink',
            operations: ['write'],
        });

        expect(result.success).toBe(true);
    });

    it('accepts both operations plus extra indexes and an expiry', () => {
        const result = createIngestionKeyRequestSchema.safeParse({
            name: 'Storyblok sink',
            operations: ['write', 'delete'],
            additionalSearchIndexIds: [INDEX_B],
            expiresAt: '2026-12-31T00:00:00.000Z',
        });

        expect(result.success).toBe(true);
    });

    it('rejects an empty operations array', () => {
        // A key that can do nothing is a configuration mistake
        const result = createIngestionKeyRequestSchema.safeParse({
            name: 'Storyblok sink',
            operations: [],
        });

        expect(result.success).toBe(false);
    });

    it('rejects an unknown operation', () => {
        const result = createIngestionKeyRequestSchema.safeParse({
            name: 'Storyblok sink',
            operations: ['write', 'drop-index'],
        });

        expect(result.success).toBe(false);
    });

    it('rejects a missing or empty name', () => {
        expect(createIngestionKeyRequestSchema.safeParse({ operations: ['write'] }).success).toBe(false);
        expect(
            createIngestionKeyRequestSchema.safeParse({ name: '', operations: ['write'] }).success
        ).toBe(false);
    });

    it('rejects a non-uuid additional index', () => {
        const result = createIngestionKeyRequestSchema.safeParse({
            name: 'Storyblok sink',
            operations: ['write'],
            additionalSearchIndexIds: ['not-a-uuid'],
        });

        expect(result.success).toBe(false);
    });
});

describe('ingestionKeyIdParamSchema', () => {
    it('accepts a uuid', () => {
        expect(ingestionKeyIdParamSchema.safeParse({ keyId: INDEX_A }).success).toBe(true);
    });

    it('rejects a non-uuid', () => {
        expect(ingestionKeyIdParamSchema.safeParse({ keyId: 'ik_abc12345' }).success).toBe(false);
    });
});
