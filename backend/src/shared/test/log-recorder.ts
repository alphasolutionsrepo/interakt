// src/shared/test/log-recorder.ts

/**
 * A stand-in for @/shared/logger/logger that keeps every line, so a test can check how
 * often and at what level a failure was logged:
 *
 *   const logs = vi.hoisted(() => [] as LogLine[]);
 *   vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
 */

export interface LogLine {
    level: 'debug' | 'info' | 'warn' | 'error';
    service: string;
    message: string;
    context: Record<string, unknown>;
}

/** Lines logged at warn or error: what a log tool counts and alerts on */
export function reported(lines: LogLine[]): LogLine[] {
    return lines.filter((line) => line.level === 'warn' || line.level === 'error');
}

export function recordingLogger(lines: LogLine[]) {
    const createLogger = (service: string) => {
        const log = (level: LogLine['level']) => (message: string, context: Record<string, unknown> = {}) => {
            lines.push({ level, service, message, context });
        };
        return {
            debug: log('debug'),
            info: log('info'),
            warn: log('warn'),
            error: (message: string, error?: unknown, context: Record<string, unknown> = {}) => {
                const fields = error instanceof Error ? { err: error } : (error as Record<string, unknown> | undefined);
                lines.push({ level: 'error', service, message, context: { ...fields, ...context } });
            },
            child: () => createLogger(service),
        };
    };
    return { createLogger, logger: createLogger('app') };
}
