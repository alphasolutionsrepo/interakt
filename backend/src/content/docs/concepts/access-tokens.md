---
sidebar_position: 22
---

# Access tokens

An **access token** is the credential a website, widget, or app uses to call an Interakt experience. Each experience has its own token — a token for one experience can't be used to access another.

If you're embedding the [drop-in widget](embed-widgets), the token is baked into the snippet you copy from the admin UI. If you're building a custom frontend or calling Interakt from a backend, the token goes into the API request.

## Where to find it
Sidebar → **Experiences** → open any experience → **Access Token** card on the detail page.

## What the screen shows

- The token, **masked** (first 10 chars + last 10 chars, with dots in the middle). The full token is never re-displayed once saved.
- A **Copy** button (copies the full value).
- A **Regenerate Token** button in the experience header — invalidates the existing one and creates a new one.
- A sample curl example showing how to call the API with the token.

## Generating a token

Tokens are generated automatically when you create an experience. The first time you open the detail page after creation, the **Copy** button has the just-created token in clipboard range — copy it then.

To create a new one (rotation, or after a compromise):

1. Open the experience detail page.
2. Click **Regenerate Token** in the header.
3. Confirm.
4. The new token is shown — copy it immediately.
5. Update every place that uses the old token.

Regenerating **invalidates the previous token immediately**. There's no "grace period" where both work. Plan for a brief switchover.

## How tokens are used

The drop-in widget uses the token via a `data-token` attribute on the script tag — invisible to most users but readable from the page source. The fact that it's "visible" is fine, because:

- The token is bound to the experience's **allowed origins** (CORS). A browser request from a domain that isn't on the list is rejected, regardless of token.
- The token has **rate limits**. Even if leaked, abuse is capped.
- The token only grants access to **that one experience** — not other experiences, not the admin UI, not raw index data.

For server-side calls (your backend calling Interakt), the token goes in an HTTP header — `Authorization: Bearer YOUR_TOKEN` or `X-Access-Token: YOUR_TOKEN`.

## What a token grants

Each token is scoped to its experience. The operations vary:

| Experience type | What the token can do |
|---|---|
| **Search experience** | Call the experience's search, autocomplete, document-lookup, and summarise endpoints. |
| **AI/chat experience** | Call the experience's chat endpoint, manage sessions for that experience. |

Tokens **cannot**:
- Access other experiences.
- Read raw index data.
- Use the admin API.
- Modify any configuration.

If a token leaks, the worst case is more requests to that one experience — which is what the rate limit and allowed-origins list are there for.

## Where to store the token

- **Server-side (your backend → Interakt):** environment variable or secrets manager. Don't commit to source control.
- **Client-side (browser → Interakt):** the token is in the page source, by design. That's OK — see "How tokens are used" above. The token's safety comes from CORS and rate limits, not from the token being secret.
- **Mobile app:** treat like a server-side secret; tokens in compiled apps are extractable.

For experiences over sensitive data (internal documents, customer PII), prefer the **server-side proxy** pattern: your backend holds the token; the browser calls your backend; your backend calls Interakt. The token never leaves your infrastructure.

## Allowed origins (CORS)

The companion to the token. Set on the experience itself (Edit → Access control → Allowed origins).

- **Empty list** — all origins allowed. Fine for server-side use; bad for browser-facing experiences.
- **One or more origins** — browser requests from any other origin are rejected.

You'll want this set to your production site's URL and (during dev) `http://localhost:3000`-style URLs.

CORS doesn't apply to server-to-server requests — the Origin header is set by browsers, not by HTTP clients like curl.

## Rate limits

Per token + IP combination.

- **Search experiences** — set on the experience (default 60 req/min).
- **AI experiences** — set on the experience (default 60 req/min, plus optional per-day cap).

Exceeding the limit returns HTTP 429 with a `Retry-After` header. Your app should back off and retry.

## Rotation procedure

Because regenerating invalidates the old token immediately, the safest rotation:

1. Coordinate with everyone who uses the token to be ready.
2. Click **Regenerate Token**. Copy the new value.
3. Update your widget snippet / backend env var / app config.
4. Verify traffic resumes on the new token (analytics).

For zero-downtime rotation, you currently need a workaround — split traffic across two experiences (a primary and a clone) so you can rotate one while the other serves.

## Common gotchas

- **Token in a public repo.** Treat tokens like passwords. If accidentally committed, regenerate immediately.
- **CORS blocks even with a valid token.** Both must pass — the token authenticates *and* the origin must be allowed. Browser console errors mention CORS.
- **Wrong experience.** A token for `product-search` won't work for `support-chat`. The slug in the URL and the token must be from the same experience.
- **Token revoked unexpectedly.** Someone clicked Regenerate; the old one no longer works. Check the experience detail page for the new value.
- **Forgetting to copy the new token.** Always copy first; *then* update your downstream config.

## Where to go next

- [Embed widgets](embed-widgets) — the easiest way to use a token.
- [Search experiences](search-experiences) / [Chat experiences](chat-experiences) — where tokens are issued and where allowed-origins are set.
- [Secrets](secrets) — unrelated to access tokens; secrets are for tool credentials, access tokens are for experiences.
