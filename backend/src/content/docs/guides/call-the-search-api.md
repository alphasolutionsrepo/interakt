---
sidebar_position: 10
---

# Calling the search API directly

Most users put search in front of their site using the [drop-in search widget](../concepts/embed-widgets). If you're building a custom frontend or calling from a backend, you can call the search API directly with the experience's access token instead.

## The basics

Every search experience is served by one public endpoint:

```
POST /api/v1/search
```

The access token identifies the experience, so there is no slug in the path. Authenticate with the token:

```
Authorization: Bearer <your-token>
```

Or:

```
X-Access-Token: <your-token>
```

A complete request:

```bash
curl -X POST "https://admin.interakt.app/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
  -d '{"query":"denim jacket","page":1,"pageSize":20}'
```

The response is `{ "success": true, "data": { ... } }`. Hits arrive as `data.results[].source`, with `total`, `pagination`, `facets` and the experience's `displayConfig` alongside.

## Why use the API instead of the widget

- **Custom frontend** — you've built your own search UI and want full control over rendering.
- **Server-side rendering** — you're calling search from your backend, not from the browser.
- **Mobile app** — there's no widget for mobile, so you call the API directly from your app code.
- **Programmatic searches** — automation, reports, batch jobs.

## What the API gives you

Same as the widget, but as raw JSON:

- Search hits with all configured fields.
- Facet counts.
- Pagination metadata.
- AI summary (if enabled on the experience), streamed from `POST /api/v1/summarize`.
- Highlights.

The display configuration is included so your frontend can format result cards consistently with whatever the widget would render.

## Where to find the full request and response shape

The exact JSON shape evolves. Two living references that are always current:

- **The Playground.** Sidebar → **Test → Search** (Experience Search tab). The network panel of your browser dev tools shows the live request and response when you run a query — copy that.
- **The API reference** on the docs site — the full request and response schema of the public API.
- **The detail page** — each experience's access token, with a copy button, on its detail page.

## Common gotchas

- **CORS errors from the browser.** Add your origin to the experience's allowed origins.
- **HTTP 401.** Token wrong, expired, or for a different experience.
- **HTTP 429.** Rate-limited. Implement exponential backoff and respect the `Retry-After` header.
- **Empty results.** Confirm the index has data in **Test → Search**, and the experience is **Active**.
- **`partial: true` in the response.** One of the experience's sources failed while the others answered; check **Analytics → Traces** for which one.

## Where to go next

- [Embed widgets](../concepts/embed-widgets) — the easier path.
- [Access tokens](../concepts/access-tokens) — how auth works.
- [Search experiences](../concepts/search-experiences) — the experience's full configuration.
- [Frontend frameworks](../integrations/frontend/) — framework-specific guides (React / Next.js) showing this call wired into a real UI.
