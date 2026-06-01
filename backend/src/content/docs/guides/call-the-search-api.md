---
sidebar_position: 10
---

# Calling the search API directly

Most users put search in front of their site using the [drop-in search widget](../concepts/embed-widgets). If you're building a custom frontend or calling from a backend, you can call the search API directly with the experience's access token instead.

## The basics

Every search experience has a public endpoint at:

```
POST /api/v1/search-experiences/<slug>/search
```

Authenticated with the experience's access token:

```
Authorization: Bearer <your-token>
```

Or:

```
X-Access-Token: <your-token>
```

The detail page of each search experience has a working **curl example** under the **Access Token** card — copy that for the exact, current request shape.

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
- AI summary (if enabled on the experience).
- Highlights.

The display configuration is included so your frontend can format result cards consistently with whatever the widget would render.

## Where to find the full request and response shape

The exact JSON shape evolves. Two living references that are always current:

- **The Playground.** Sidebar → **Playground → Experience Search**. The network panel of your browser dev tools shows the live request and response when you run a query — copy that.
- **The detail page's curl example.** Each experience's **Access Token** card has a copy-pasteable curl invocation with the current URL and headers.

## Common gotchas

- **CORS errors from the browser.** Add your origin to the experience's allowed origins.
- **HTTP 401.** Token wrong, expired, or for a different experience.
- **HTTP 429.** Rate-limited. Implement exponential backoff and respect the `Retry-After` header.
- **Empty results.** Confirm the index has data in **Playground → Index Search**, and the experience is **Active**.

## Where to go next

- [Embed widgets](../concepts/embed-widgets) — the easier path.
- [Access tokens](../concepts/access-tokens) — how auth works.
- [Search experiences](../concepts/search-experiences) — the experience's full configuration.
