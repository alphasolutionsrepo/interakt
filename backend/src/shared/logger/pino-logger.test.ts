// src/shared/logger/pino-logger.test.ts

/**
 * An error is logged with what explains it: the errors it wraps (the engine's own words
 * are usually in the cause) and the provider's response, with secrets left out.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceLogger, createPinoOptions } from './pino-logger';

import { AppError } from '@/shared/errors/app-error';
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { SearchError } from '@/features/search/search.types';

function capture(format?: 'json' | 'pretty') {
    const lines: Array<Record<string, unknown>> = [];
    const pinoLogger = pino(createPinoOptions(format), { write: (line: string) => lines.push(JSON.parse(line)) });
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

describe('an error in a JSON log line', () => {
    // OpenTelemetry's names for an exception, so any log tool reads the error without
    // knowing our format: https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-logs/
    it('is named the OpenTelemetry way, with the causes and the provider response kept in err', () => {
        const { lines, logger } = capture('json');
        const failed = refused();
        logger.error('Request failed', failed);
        expect(lines[0]).toMatchObject({
            'exception.type': 'Error',
            'exception.message': '"abc" isn\'t a valid value for rating',
            'exception.stacktrace': failed.stack,
            'error.type': 'Error',
            err: { message: '"abc" isn\'t a valid value for rating', cause: { statusCode: 400 } },
        });
        expect(lines[0].err).not.toHaveProperty('stack');
    });

    it("gives the error's code as its type, as AppError's NOT_FOUND", () => {
        const { lines, logger } = capture('json');
        logger.warn('Request rejected', { err: new AppError('Search index not found', { code: 'NOT_FOUND', status: 404 }) });
        expect(lines[0]).toMatchObject({ 'exception.type': 'AppError', 'error.type': 'NOT_FOUND' });
    });

    it('names an error logged as error the same way', () => {
        const { lines, logger } = capture('json');
        logger.error('Turn planner failed', { error: refused() });
        expect(lines[0]).toMatchObject({ 'exception.type': 'Error', error: { cause: { statusCode: 400 } } });
    });

    it('adds nothing to a line without an error', () => {
        const { lines, logger } = capture('json');
        logger.warn('Warm-up search failed', { error: 'connect ECONNREFUSED' });
        expect(Object.keys(lines[0]).filter((k) => k.startsWith('exception.') || k === 'error.type')).toEqual([]);
    });

    it('stays as it was in the readable development output', () => {
        const { lines, logger } = capture('pretty');
        logger.error('Request failed', refused());
        expect(lines[0]).not.toHaveProperty(['exception.type']);
        expect(lines[0]).toMatchObject({ err: { stack: expect.stringContaining('Error') } });
    });
});

// One tracer for the file: OpenTelemetry takes the first provider registered
const tracer = (() => {
    const provider = new NodeTracerProvider();
    provider.register();
    return provider.getTracer('test');
})();

describe('a JSON log line written inside a trace', () => {
    // Links the line to its trace, under the names OpenTelemetry's own pino instrumentation uses

    it('carries the trace id, span id and trace flags of the active span', () => {
        const { lines, logger } = capture('json');
        const span = tracer.startActiveSpan('search', (active) => {
            logger.warn('Request rejected', { requestId: active.spanContext().traceId });
            active.end();
            return active;
        });
        const { traceId, spanId } = span.spanContext();
        expect(lines[0]).toMatchObject({ trace_id: traceId, span_id: spanId, trace_flags: '01', requestId: traceId });
    });

    it('carries nothing outside a trace', () => {
        const { lines, logger } = capture('json');
        logger.info('Started');
        expect(Object.keys(lines[0]).filter((k) => k.startsWith('trace_') || k === 'span_id')).toEqual([]);
    });

    it('stays as it was in the readable development output', () => {
        const { lines, logger } = capture('pretty');
        tracer.startActiveSpan('search', (active) => {
            logger.info('Searched');
            active.end();
        });
        expect(lines[0]).not.toHaveProperty('trace_id');
    });
});

describe('credentials in a log line', () => {
    const URL_WITH_PASSWORD = 'https://elastic:hunter2@es.example.com:9200';
    const SIGNED_URL = 'https://search.example.com/indexes?api-version=2024&api_key=k3y-value&sig=s1gnature';

    it('are left out of the message, the error, its stack and its causes', () => {
        const { lines, logger } = capture('json');
        const engine = new Error(`connect ECONNREFUSED ${URL_WITH_PASSWORD}`);
        logger.error(`Request to ${SIGNED_URL} failed`, new Error(`fetch ${SIGNED_URL} failed`, { cause: engine }));
        const line = JSON.stringify(lines[0]);
        for (const secret of ['hunter2', 'k3y-value', 's1gnature']) expect(line).not.toContain(secret);
        expect(lines[0]).toMatchObject({
            msg: 'Request to https://search.example.com/indexes?api-version=2024&api_key=[Redacted]&sig=[Redacted] failed',
            err: { cause: { message: 'connect ECONNREFUSED https://[Redacted]@es.example.com:9200' } },
        });
    });

    it('are left out of any field, at any depth', () => {
        const { lines, logger } = capture();
        logger.warn('Source failed', { source: { connection: { url: URL_WITH_PASSWORD, settings: { apiKey: 'sk-live-123' } } }, header: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2ln' });
        const line = JSON.stringify(lines[0]);
        for (const secret of ['hunter2', 'sk-live-123', 'eyJhbGciOiJIUzI1NiJ9']) expect(line).not.toContain(secret);
        expect(lines[0]).toMatchObject({ source: { connection: { url: 'https://[Redacted]@es.example.com:9200' } }, header: 'Bearer [Redacted]' });
    });

    it('are left out of the fields of a child logger', () => {
        const { lines, logger } = capture();
        logger.child({ endpoint: URL_WITH_PASSWORD }).child({ source: { url: URL_WITH_PASSWORD } }).info('Connected');
        expect(JSON.stringify(lines[0])).not.toContain('hunter2');
    });

    it('are left out of a URL object, which logs as its text', () => {
        const { lines, logger } = capture();
        logger.warn('Source failed', { endpoint: new URL(URL_WITH_PASSWORD) });
        expect(lines[0]).toMatchObject({ endpoint: 'https://[Redacted]@es.example.com:9200/' });
    });

    it('are left out of a class instance', () => {
        class Connection { constructor(readonly url: string, readonly apiKey: string) {} }
        const { lines, logger } = capture();
        logger.warn('Source failed', { connection: new Connection(URL_WITH_PASSWORD, 'sk-live-123') });
        expect(JSON.stringify(lines[0])).not.toMatch(/hunter2|sk-live-123/);
    });

    it('leave other fields as they are, however long or deep', () => {
        const { lines, logger } = capture();
        const shared = { size: 10 };
        const fields = {
            url: 'https://es.example.com:9200/_search?size=10', body: 'x'.repeat(5000), tokens: 120, maxTokens: 4000, requestId: '4bf92f3577b34da6a3ce929d0e0e4736',
            ids: Array.from({ length: 60 }, (_, i) => i),
            query: { bool: { must: [{ nested: { query: { match: { field: { query: 'x', boost: 2 } } } } }] } },
            first: shared, second: shared,
        };
        logger.info('Searched', { ...fields, at: new Date(0) });
        expect(lines[0]).toMatchObject({ ...fields, at: '1970-01-01T00:00:00.000Z' });
    });

    it('leave the details an error response logs next to its error', () => {
        const { lines, logger } = capture('json');
        const details = { fields: ['rating'] };
        logger.warn('Request rejected', { err: new AppError('Bad filter', { code: 'INVALID_FILTER', status: 400, details }), details });
        expect(lines[0]).toMatchObject({ details, err: { details } });
    });

    // A provider's answer can be huge, so an error keeps the limits it always had,
    // counted from the error, however deep it is logged
    it("keep the engine's answer as deep as before", () => {
        const { lines, logger } = capture('json');
        const shardFailure = { type: 'query_shard_exception', reason: 'failed to create query', caused_by: { type: 'number_format_exception', reason: 'For input string: abc' } };
        const failed = Object.assign(new Error('all shards failed'), { meta: { statusCode: 400, body: { error: { type: 'search_phase_execution_exception', failed_shards: [{ shard: 0, reason: shardFailure }] } } } });
        logger.error('Search failed', failed);
        expect(lines[0]).toMatchObject({ err: { details: { failed_shards: [{ reason: shardFailure }] } } });
    });

    it('keep as many causes as before', () => {
        const { lines, logger } = capture('json');
        let failed = new Error('connect ECONNREFUSED');
        for (let i = 1; i <= 6; i++) failed = new Error(`wrapped ${i}`, { cause: failed });
        logger.error('Search failed', failed);
        let err = lines[0].err as Record<string, unknown>;
        for (let i = 1; i <= 6; i++) err = err.cause as Record<string, unknown>;
        expect(err).toMatchObject({ message: 'connect ECONNREFUSED' });
    });

    it('name an error logged twice in full, both times', () => {
        const { lines, logger } = capture('json');
        const failed = new Error('timeout', { cause: new Error('socket hang up') });
        logger.warn('Retry failed', { attempts: [failed], error: failed });
        expect(lines[0]).toMatchObject({
            'exception.stacktrace': expect.stringContaining('timeout'),
            attempts: [{ message: 'timeout', cause: { message: 'socket hang up' } }],
            error: { message: 'timeout', cause: { message: 'socket hang up' } },
        });
    });

    it('expand an error anywhere in the fields', () => {
        const { lines, logger } = capture();
        logger.warn('Retry', { attempt: { n: 2, error: new Error(`timeout calling ${URL_WITH_PASSWORD}`) } });
        expect(lines[0]).toMatchObject({ attempt: { n: 2, error: { message: 'timeout calling https://[Redacted]@es.example.com:9200' } } });
    });
});

describe('a value that cannot be read', () => {
    // Logging never throws: the line is written, with what could be read
    it.each([
        ['whose toJSON throws', { toJSON() { throw new Error('boom'); } }, '[Unreadable]'],
        ['whose toJSON returns itself', { id: 7, toJSON() { return this; } }, { id: 7 }],
        ['with a getter that throws', Object.defineProperty({ id: 7 }, 'broken', { enumerable: true, get() { throw new Error('boom'); } }), { id: 7, broken: '[Unreadable]' }],
    ])('is written as far as it can be: a value %s', (_what, value, written) => {
        const { lines, logger } = capture('json');
        expect(() => logger.info('Logged', { value, requestId: 'r1' })).not.toThrow();
        expect(lines[0]).toMatchObject({ msg: 'Logged', requestId: 'r1', value: written });
    });

    it('names an error whose message is not text', () => {
        const { lines, logger } = capture('json');
        logger.error('Search failed', Object.assign(new Error('x'), { message: { code: 'E' } as unknown as string }));
        expect(lines[0]).toMatchObject({ 'exception.type': 'Error', err: { name: 'Error' } });
    });

    it('keeps the error and the other fields when one value cannot be read at all', () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        const { lines, logger } = capture('json');
        expect(() => logger.error('Search failed', new Error('boom'), { requestId: 'r1', value: proxy })).not.toThrow();
        expect(lines[0]).toMatchObject({ requestId: 'r1', value: '[Unreadable]', 'exception.message': 'boom', err: { message: 'boom' } });
    });

    it('keeps an error whose own field cannot be read', () => {
        class Flaky extends Error { get status(): number { throw new Error('no status'); } }
        const { lines, logger } = capture('json');
        logger.error('Search failed', new Flaky('boom'), { requestId: 'r1' });
        expect(lines[0]).toMatchObject({ requestId: 'r1', err: { message: 'boom', status: '[Unreadable]' } });
    });

    it('does not throw from child() either', () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        const { lines, logger } = capture();
        expect(() => logger.child({ value: proxy, requestId: 'r1' }).info('Logged')).not.toThrow();
        expect(lines[0]).toMatchObject({ msg: 'Logged', requestId: 'r1' });
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
        expect(line).toMatchObject({ 'exception.type': 'Error', err: { cause: { message: expect.stringContaining('For input string') } } });
    });

    it('links a line written inside a request span to its trace', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        const written: string[] = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
        const { createLogger } = await import('./pino-logger');

        const traceId = tracer.startActiveSpan('GET /api/search-indexes', (span) => {
            createLogger('production-trace-test').warn('Request rejected');
            span.end();
            return span.spanContext().traceId;
        });

        const line = written.map((w) => JSON.parse(w)).find((l) => l.service === 'production-trace-test');
        expect(line).toMatchObject({ trace_id: traceId, span_id: expect.stringMatching(/^[0-9a-f]{16}$/) });
    });
});
