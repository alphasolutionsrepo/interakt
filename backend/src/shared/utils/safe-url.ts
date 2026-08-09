// src/shared/utils/safe-url.ts

/**
 * URL Safety
 *
 * Validates a URL before it is rendered into a DOM attribute.
 *
 * Needed wherever indexed document content reaches an `href` or `src`: whoever can
 * write to an index then controls that attribute, and since ingestion keys made the
 * document write path reachable server-to-server, index content is not necessarily
 * something a maintainer vetted.
 *
 * Two concrete risks this closes:
 * - `javascript:` in an href executes in the viewer's authenticated session. React
 *   warns on that one scheme, but a framework warning is not a guard, and `data:`
 *   and friends are not covered by it.
 * - An `<img src>` fires a request to an arbitrary host the moment a row renders,
 *   before any click.
 *
 * Deliberately free of `window`: these run inside client components that Next also
 * server-renders, where `window` is undefined, and the tests run in vitest's node
 * environment.
 */

/** Schemes allowed for a link or image by default. */
const DEFAULT_ALLOWED_PROTOCOLS = ['http:', 'https:'] as const;

/** Shape check for an email address — deliberately loose, just enough to reject junk. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Return a URL safe to put in an `href` or `src`, or null if it is not.
 *
 * Same-origin relative paths are allowed as-is: catalogues routinely store images
 * as `/images/foo.jpg`, and rejecting those would blank every such thumbnail. A
 * protocol-relative `//host/path` is NOT treated as relative — it silently adopts
 * the page's scheme and points at another origin, which is exactly the kind of
 * redirection this function exists to stop.
 *
 * @param raw - The candidate URL, straight from document content
 * @param allow - Permitted protocols, including the trailing colon
 * @returns The URL to render, or null to fall back to plain text
 */
export function safeUrl(
    raw: string,
    allow: readonly string[] = DEFAULT_ALLOWED_PROTOCOLS,
): string | null {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Normalise the way a browser will before deciding anything.
    //
    // Browsers strip tab/newline/carriage return anywhere in a URL and treat a
    // backslash as a forward slash. Checking the raw string instead let both
    // smuggle a value past the guards below: "/\evil.com/x.jpg" looked like a
    // same-origin path here, but resolves cross-origin once rendered, and
    // "java\nscript:" hid a blocked scheme from the protocol check.
    const normalized = trimmed.replace(/[\t\n\r]/g, '').replace(/\\/g, '/');

    if (normalized.length === 0) {
        return null;
    }

    // Protocol-relative: rejected before the relative check below would accept it.
    if (normalized.startsWith('//')) {
        return null;
    }

    // Same-origin absolute path.
    if (normalized.startsWith('/')) {
        return normalized;
    }

    try {
        // No base URL on purpose: a bare relative reference like "images/x.jpg"
        // throws here and falls through to null, which is the safe answer. It also
        // keeps this usable during server rendering, where there is no origin.
        const parsed = new URL(normalized);
        return allow.includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
}

/**
 * Return a `mailto:` link for a valid-looking address, or null.
 *
 * Without the shape check, an arbitrary string is pasted into the scheme — and a
 * value containing its own scheme is precisely the case worth blocking.
 */
export function safeMailto(raw: string): string | null {
    const trimmed = raw.trim();
    return EMAIL_PATTERN.test(trimmed) ? `mailto:${trimmed}` : null;
}
