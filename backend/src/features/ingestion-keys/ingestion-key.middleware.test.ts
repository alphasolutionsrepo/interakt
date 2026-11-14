// src/features/ingestion-keys/ingestion-key.middleware.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./ingestion-key.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./ingestion-key.service')>()),
    verifyIngestionKey: vi.fn(),
}));

import { ingestionRateLimitKey } from './ingestion-key.middleware';

function request(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://interakt.test/api/search-indexes/i/documents', { headers });
}

describe('ingestionRateLimitKey', () => {
    it('counts a request with an ingestion key by the key as presented, not its public prefix alone', () => {
        const withKey = (secret: string) => request({ Authorization: `Bearer ik_abc12345_${secret}`, 'X-Forwarded-For': '9.9.9.9' });
        const real = ingestionRateLimitKey(withKey('thesecret'));
        expect(real).toMatch(/^key:ik_abc12345:[0-9a-f]{16}$/);
        // The same key always counts the same; a made-up secret on the same prefix doesn't
        expect(ingestionRateLimitKey(withKey('thesecret'))).toBe(real);
        expect(ingestionRateLimitKey(withKey('madeup'))).not.toBe(real);
        // The secret itself is not in the identity
        expect(real).not.toContain('thesecret');
    });

    it('counts other requests by the address the proxy added', () => {
        expect(ingestionRateLimitKey(request({ 'X-Forwarded-For': '10.0.0.1, 9.9.9.9' }))).toBe('ip:9.9.9.9');
        expect(ingestionRateLimitKey(request({ Authorization: 'Bearer not-a-key', 'X-Forwarded-For': '9.9.9.9' }))).toBe('ip:9.9.9.9');
    });
});
