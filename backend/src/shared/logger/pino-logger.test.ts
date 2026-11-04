// src/shared/logger/pino-logger.test.ts

/**
 * An error is logged with what explains it: the errors it wraps (the engine's own words
 * are usually in the cause) and the provider's response, with secrets left out.
 */

import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceLogger, createPinoOptions } from './pino-logger';

import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { SearchError } from '@/features/search/search.types';

function capture() {
    const lines: Array<Record<string, unknown>> = [];
    const pinoLogger = pino(createPinoOptions(), { write: (line: string) => lines.push(JSON.parse(line)) });
    return { lines, logger: new ServiceLogger(pinoLogger.child({ service: 'test' })) };
}

const refused = () => {
    const engine = Object.assign(new Error('failed to create query: For input string: "abc"'), {
        statusCode: 400,
        meta: { body: { error: { type: 'search_phase_execution_exception' } } },
        headers: { authorization: 'ApiKey c2VjcmV0' },
    });
    return new Error('"abc" isn\'t a valid value for rating', { cause: engine });
};

describe('an error in a log line', () => {
    it('keeps the cause and the provider response', () => {
        const { lines, logger } = capture();
        logger.error('Request failed', refused(), { requestId: 'r1' });
        expect(lines[0]).toMatchObject({
            level: 'error',
            msg: 'Request failed',
            service: 'test',
            requestId: 'r1',
            err: {
                message: '"abc" isn\'t a valid value for rating',
                cause: { message: 'failed to create query: For input string: "abc"', statusCode: 400, details: { type: 'search_phase_execution_exception' } },
            },
        });
    });

    it('is explained the same way on a warning', () => {
        const { lines, logger } = capture();
        logger.warn('Request rejected', { err: refused() });
        expect(lines[0]).toMatchObject({ level: 'warn', err: { cause: { message: expect.stringContaining('For input string') } } });
    });

    it('leaves out the credentials the provider error carries', () => {
        const { lines, logger } = capture();
        logger.error('Request failed', refused());
        expect(JSON.stringify(lines[0])).not.toContain('c2VjcmV0');
    });

    it('says which external source failed and what it answered', () => {
        const { lines, logger } = capture();
        const rejected = new ExternalSearchError('Sitecore Search', 'Sitecore Search rejected the request', 401);
        logger.error('Request failed', new SearchError('An external search source is unavailable', 'SOURCE_UNAVAILABLE', { dataSourceId: 'ds' }, { cause: rejected }));
        expect(lines[0]).toMatchObject({ err: { details: { dataSourceId: 'ds' }, cause: { provider: 'Sitecore Search', status: 401 } } });
    });

    it('expands an error logged as error, as it does err', () => {
        const { lines, logger } = capture();
        logger.error('Turn planner failed', { error: refused() });
        expect(lines[0]).toMatchObject({ error: { message: '"abc" isn\'t a valid value for rating', cause: { statusCode: 400 } } });
    });

    it("keeps the fields a database error explains itself with", () => {
        const { lines, logger } = capture();
        const pgError = Object.assign(new Error('insert or update violates foreign key constraint "fk_session"'), {
            name: 'PostgresError', code: '23503', detail: 'Key (session_id)=(s1) is not present in table "sessions".',
            table_name: 'messages', constraint_name: 'fk_session', severity: 'ERROR',
        });
        const queryFailed = Object.assign(new Error('Failed query: insert into messages'), { query: 'insert into messages', cause: pgError });
        logger.error('Persistence failed', { error: queryFailed });
        expect(lines[0]).toMatchObject({
            error: { query: 'insert into messages', cause: { code: '23503', detail: expect.stringContaining('is not present'), table_name: 'messages', constraint_name: 'fk_session' } },
        });
    });

    it('leaves out the credentials of an error logged as error', () => {
        const { lines, logger } = capture();
        logger.error('Turn planner failed', { error: refused() });
        expect(JSON.stringify(lines[0])).not.toContain('c2VjcmV0');
    });

    it('leaves a plain object logged as error as it is', () => {
        const { lines, logger } = capture();
        logger.warn('Tool failed', { error: { code: 'TIMEOUT', retryable: true } });
        expect(lines[0]).toMatchObject({ error: { code: 'TIMEOUT', retryable: true } });
    });

    it('leaves an error message logged as error as it is', () => {
        const { lines, logger } = capture();
        logger.warn('Warm-up search failed', { error: 'connect ECONNREFUSED' });
        expect(lines[0]).toMatchObject({ error: 'connect ECONNREFUSED' });
    });

    it('keeps the fields of a child logger', () => {
        const { lines, logger } = capture();
        logger.child({ requestId: 'r2' }).error('Request failed', refused());
        expect(lines[0]).toMatchObject({ service: 'test', requestId: 'r2', err: { cause: { statusCode: 400 } } });
    });
});

describe('error() called without an error', () => {
    it('keeps the context when there is no error', () => {
        const { lines, logger } = capture();
        logger.error('Boom', undefined, { requestId: 'r1' });
        expect(lines[0]).toMatchObject({ msg: 'Boom', requestId: 'r1' });
    });

    it('keeps both a context object given in place of the error and the context after it', () => {
        const { lines, logger } = capture();
        logger.error('Boom', { a: 1 }, { b: 2 });
        expect(lines[0]).toMatchObject({ a: 1, b: 2 });
    });

    it('adds nothing for an empty context', () => {
        const { lines, logger } = capture();
        logger.error('Boom', {});
        expect(Object.keys(lines[0]).sort()).toEqual(['env', 'level', 'msg', 'service', 'time']);
    });
});

describe('createLogger in production', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('writes JSON with the error and its cause', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        const written: string[] = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
        const { createLogger } = await import('./pino-logger');

        createLogger('production-test').error('Request failed', refused());

        const line = written.map((w) => JSON.parse(w)).find((l) => l.service === 'production-test');
        expect(line).toMatchObject({ err: { cause: { message: expect.stringContaining('For input string') } } });
    });
});
