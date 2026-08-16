# Frontend frameworks

These guides show how to put Interakt **search** and **chat** into your app's frontend. Whatever
your stack, there are two ways to do it — and most of what's framework-specific is *how you load a
script* and *how you handle a streaming response*, which is exactly what the per-framework guides
cover.

## Two ways to integrate

### 1. Drop-in widget — fastest

A single `<script>` tag plus a container `<div>`. Interakt renders the search box (or chat window),
styles it from your admin configuration, calls the API, and manages the access token for you. No
application code.

Use it when you want search or chat live quickly and the built-in UI fits your needs. See
[Embed widgets](../../concepts/embed-widgets) for the full configuration reference (theme, layout,
modal vs inline, suggested questions, …).

### 2. Custom API integration — full control

Call Interakt's REST and SSE endpoints directly and render the results in your own components. You
own the markup, the styling, and the interaction model.

Use it when you need search or chat to *be* part of your UI — a bespoke results page, a chat panel
that matches your design system, or a mobile app where there is no widget. See
[Calling the search API](../../guides/call-the-search-api) and
[Calling the chat API](../../guides/call-the-chat-api) for the endpoint contracts.

## Which should I use?

| | Drop-in widget | Custom API |
|---|---|---|
| **Setup effort** | Minutes — paste a snippet | Hours — you build the UI |
| **Look & feel** | Configured in admin, themable | Anything you can build |
| **App code** | None | Fetch + render + state |
| **Best for** | Standard search/chat, quick launch | Bespoke UX, deep product integration |
| **You can mix** | Widget for chat… | …and custom API for search, or vice-versa |

Both routes hit the **same experiences** and use the same **public access token** — the widget is
just a convenience wrapper over the API, so you can start with the widget and move to the API later
without re-configuring anything.

## The credential model (read once)

Every frontend integration authenticates with an experience's **access token**. It is:

- **Public and safe to ship to the browser** — it's scoped to one experience and **bound to an
  allowed-origins list**, so a leaked token can't be used from a domain you haven't allowed.
- **Different from the per-index ingestion key** used by CMS/e-commerce integrations to *write*
  documents. The ingestion key is a server secret and must never reach the browser.

Add your app's origin(s) to the experience's **Allowed origins** before testing from the browser —
a missing origin is the single most common cause of CORS errors. Full details:
[Access tokens](../../concepts/access-tokens).

## Pick your framework

- [React / Next.js](./react-nextjs) — React SPA (Vite/CRA) and Next.js (App Router & Pages Router).
- **Vue / Nuxt** — *coming soon.*
- **Astro / SvelteKit** — *coming soon.*
- **Vanilla JS / HTML** — *coming soon.*

Don't see your framework? The patterns are portable: load the widget script the way your framework
loads third-party scripts, and call the APIs with `fetch`. The [React / Next.js](./react-nextjs)
guide explains the reasoning behind each step so you can translate it.
