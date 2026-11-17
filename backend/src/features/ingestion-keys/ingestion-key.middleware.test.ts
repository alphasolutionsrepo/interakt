// src/features/ingestion-keys/ingestion-key.middleware.test.ts

import { NextRequest } from 'next/server';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
const stored = vi.hoisted(() => ({ key: null as null | { id: string; revokedAt: Date | null; expiresAt: Date | null } }));
vi.mock('./ingestion-key.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./ingestion-key.service')>()),
    identifyIngestionKey: vi.fn(async () => (stored.key ? { success: true, key: stored.key } : { success: false, reason: 'unknown' })),
    verifyIngestionKey: vi.fn(),
}));

import { ingestionRateLimitKey } from './ingestion-key.middleware';

import { rateLimiter } from '@/shared/api/rate-limit';

function request(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://interakt.test/api/search-indexes/i/documents', { headers });
}

beforeEach(() => {
    stored.key = null;
    rateLimiter.clear();
});

describe('ingestionRateLimitKey', () => {
    it('counts a live key by its id, so no other caller can spend its allowance', async () => {
        stored.key = { id: 'key-1', revokedAt: null, expiresAt: null };
        expect(await ingestionRateLimitKey(request({ Authorization: 'Bearer ik_abc12345_thesecret', 'X-Forwarded-For': '9.9.9.9' }))).toEqual({ key: 'key:key-1', shared: false });
    });

    it('leaves a wrong, revoked or expired key to the failed-check limit per address', async () => {
        expect(await ingestionRateLimitKey(request({ Authorization: 'Bearer ik_abc12345_madeup' }))).toBeNull();
        expect(await ingestionRateLimitKey(request({ Authorization: 'Bearer not-a-key', 'X-Forwarded-For': '9.9.9.9' }))).toBeNull();
        stored.key = { id: 'key-1', revokedAt: new Date('2026-01-01'), expiresAt: null };
        expect(await ingestionRateLimitKey(request({ Authorization: 'Bearer ik_abc12345_thesecret' }))).toBeNull();
        stored.key = { id: 'key-1', revokedAt: null, expiresAt: new Date('2020-01-01') };
        expect(await ingestionRateLimitKey(request({ Authorization: 'Bearer ik_abc12345_thesecret' }))).toBeNull();
    });

    it('counts a request without a key (an admin session) by the address the proxy added', async () => {
        expect(await ingestionRateLimitKey(request({ 'X-Forwarded-For': '10.0.0.1, 9.9.9.9' }))).toEqual({ key: 'ip:9.9.9.9', shared: false });
        // No trusted address: one shared count (held to a higher limit by withRateLimit)
        expect(await ingestionRateLimitKey(request({}))).toEqual({ key: 'ip:no-trusted-address', shared: true });
    });
});
