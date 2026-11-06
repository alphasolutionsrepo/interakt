// src/features/data-source/external-search/engines/response-body.ts

/**
 * An external engine's answer, read as text first and then as JSON. A body can be read
 * only once, so reading it as JSON first loses the words of a proxy's HTML page.
 * Reading fails as fetch does (a timeout covers the body too), so callers decide.
 */
export async function readResponseBody(response: Response): Promise<{ text: string; json?: unknown }> {
    const text = await response.text();
    try {
        return { text, json: JSON.parse(text) };
    } catch {
        return { text };
    }
}

/** The start of a body that isn't JSON, for a message: ": <html>…", or nothing */
export function bodyExcerpt(text: string): string {
    const trimmed = text.trim();
    return trimmed ? `: ${trimmed.slice(0, 300)}` : '';
}
