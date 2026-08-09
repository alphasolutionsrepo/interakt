import { describe, it, expect } from 'vitest';

import { safeMailto, safeUrl } from './safe-url';

// ============================================================================
// safeUrl
// ============================================================================

describe('safeUrl — schemes that must be blocked', () => {
    it('rejects javascript:', () => {
        // Would execute in the admin's authenticated session if rendered as an href.
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('JavaScript:alert(1)')).toBeNull();
    });

    it('rejects data:', () => {
        expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('rejects other non-web schemes', () => {
        expect(safeUrl('file:///etc/passwd')).toBeNull();
        expect(safeUrl('vbscript:msgbox(1)')).toBeNull();
        expect(safeUrl('ftp://example.com/x')).toBeNull();
    });

    it('rejects a protocol-relative URL', () => {
        // Adopts the page's scheme but points at another origin — it must not be
        // mistaken for a same-origin relative path.
        expect(safeUrl('//evil.com/x.jpg')).toBeNull();
    });

    it('rejects leading whitespace used to disguise a scheme', () => {
        expect(safeUrl('  javascript:alert(1)')).toBeNull();
    });

    it('rejects a backslash masquerading as a same-origin path', () => {
        // Browsers normalise "\\" to "/", so "/\evil.com/x.jpg" resolves
        // cross-origin even though it starts with a single slash. Checking the raw
        // string let this straight past the protocol-relative guard.
        expect(safeUrl('/\\evil.com/x.jpg')).toBeNull();
        expect(safeUrl('\\\\evil.com/x.jpg')).toBeNull();
        expect(safeUrl('/\\/evil.com/x.jpg')).toBeNull();
    });

    it('rejects a scheme split by control characters', () => {
        // Browsers strip tab/newline/CR from URLs before resolving them.
        expect(safeUrl('java\nscript:alert(1)')).toBeNull();
        expect(safeUrl('java\tscript:alert(1)')).toBeNull();
        expect(safeUrl('java\rscript:alert(1)')).toBeNull();
    });
});

describe('safeUrl — values that must keep working', () => {
    it('allows https and http', () => {
        expect(safeUrl('https://example.com/x.jpg')).toBe('https://example.com/x.jpg');
        expect(safeUrl('http://example.com/x.jpg')).toBe('http://example.com/x.jpg');
    });

    it('allows a same-origin absolute path', () => {
        // Real catalogue data stores images this way; rejecting it would blank
        // every existing thumbnail.
        expect(safeUrl('/images/prod-0001_haven_hart.jpg'))
            .toBe('/images/prod-0001_haven_hart.jpg');
    });

    it('preserves query strings and fragments', () => {
        expect(safeUrl('https://example.com/x?a=1&b=2#frag'))
            .toBe('https://example.com/x?a=1&b=2#frag');
    });

    it('honours a custom protocol allowlist', () => {
        expect(safeUrl('ftp://example.com/x', ['ftp:'])).toBe('ftp://example.com/x');
        expect(safeUrl('https://example.com/x', ['ftp:'])).toBeNull();
    });
});

describe('safeUrl — malformed input', () => {
    it('rejects an empty or whitespace-only value', () => {
        expect(safeUrl('')).toBeNull();
        expect(safeUrl('   ')).toBeNull();
    });

    it('rejects an unparseable value', () => {
        expect(safeUrl('not a url')).toBeNull();
        expect(safeUrl('http://')).toBeNull();
    });

    it('rejects a bare relative reference', () => {
        // No base URL is used, so this cannot be resolved safely. Falling back to
        // text is the correct answer.
        expect(safeUrl('images/x.jpg')).toBeNull();
    });

    it('never touches window, so it is safe during server rendering', () => {
        // The component using this is a client component that Next server-renders,
        // where `window` is undefined. These tests run in vitest's node
        // environment, so passing here is itself the assertion.
        expect(typeof globalThis.window).toBe('undefined');
        expect(safeUrl('https://example.com')).toBe('https://example.com/');
    });
});

// ============================================================================
// safeMailto
// ============================================================================

describe('safeMailto', () => {
    it('builds a mailto for a valid address', () => {
        expect(safeMailto('a@b.com')).toBe('mailto:a@b.com');
        expect(safeMailto('  first.last@example.co.uk  ')).toBe('mailto:first.last@example.co.uk');
    });

    it('rejects anything that is not an address', () => {
        expect(safeMailto('not-an-address')).toBeNull();
        expect(safeMailto('')).toBeNull();
        expect(safeMailto('a@b')).toBeNull();
        expect(safeMailto('a b@c.com')).toBeNull();
    });

    it('rejects a value smuggling its own scheme', () => {
        // Without the shape check this would be pasted straight into the href.
        expect(safeMailto('javascript:alert(1)')).toBeNull();
        expect(safeMailto('a@b.com?body=x javascript:alert(1)')).toBeNull();
    });
});
