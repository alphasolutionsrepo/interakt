// src/shared/api/stream-events.ts

const DONE = Symbol('done');

/**
 * The events of a server-sent event stream our API answers with (`data: <json>` lines),
 * parsed, as they arrive, up to the [DONE] marker if one is sent. A line that isn't JSON
 * is skipped.
 */
export async function* streamEvents<T = Record<string, unknown>>(response: Response): AsyncGenerator<T> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';

    const parse = (line: string): T | typeof DONE | undefined => {
        if (!line.startsWith('data: ')) return undefined;
        const data = line.slice(6);
        if (data === '[DONE]') return DONE;
        try {
            return JSON.parse(data) as T;
        } catch {
            return undefined;
        }
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            const text = done ? buffer + decoder.decode() : buffer + decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            buffer = done ? '' : lines.pop() || '';
            for (const line of lines) {
                const event = parse(line);
                if (event === DONE) return;
                if (event !== undefined) yield event;
            }
            if (done) return;
        }
    } finally {
        reader.releaseLock();
    }
}
