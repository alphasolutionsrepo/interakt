# Integrate Interakt with React & Next.js

> **Series:** Integrating Interakt into your frontend — React / Next.js
> Add Interakt search and chat to a React or Next.js app, either as a drop-in widget or as a
> custom UI built on the APIs.

This guide covers both ways to put an Interakt experience in front of users from a React or Next.js
frontend:

1. **The drop-in widget** — load Interakt's script and let it render search or chat for you.
2. **The custom API integration** — call the search and chat endpoints directly and render the
   results in your own components.

Both hit the same experiences with the same public **access token**. Start with whichever fits, and
mix them freely — widget for chat, custom UI for search, or any combination.

> New to the two modes or the credential model? Read the
> [Frontend frameworks overview](./) first — this guide assumes it.

---

## How the pieces fit together

```
   ┌────────────────────┐   X-Access-Token (public, origin-bound)  ┌──────────────────┐
   │  Your React / Next │ ───────────────────────────────────────> │     Interakt     │
   │   app (browser)    │   POST /search-experiences/<slug>/search │    Experience    │
   │                    │   POST /ai-experiences/<slug>/chat (SSE  │  (search / chat) │
   │  • widget scrip    │ <─────────────────────────────────────── │                  │
   │  • or your ownUI   │   JSON results  /  streamed SSE events   └──────────────────┘
   └────────────────────┘
```

The widget and your custom UI are two clients of the **same endpoints**. The widget is a convenience
wrapper; calling the API directly just means you own the rendering.

---

## Prerequisites

- A React app (Vite, Create React App, or similar) **or** a Next.js app (App Router or Pages Router).
- An Interakt **Search Experience** and/or **AI (Chat) Experience**, each **Active**, with:
  - Its **access token** (`X-Access-Token`) — safe to expose in the browser.
  - Its **slug** (used in the API URL).
  - Your app's origin(s) added to the experience's **Allowed origins** — including
    `http://localhost:<port>` for local development. See [Access tokens](../../concepts/access-tokens).

> API calls in this guide use the hosted base URL `https://admin.interakt.app`. If you self-host
> Interakt, swap in your own base URL.

---

## Part 1 — Drop-in widget

The widget is a `<script>` tag plus a container `<div>`. The challenge in React/Next.js isn't the
snippet — it's making sure the script **loads once**, **survives hydration**, and **cleans up** on
navigation. Below are the idioms for each setup.

> **Get the exact snippet first.** Copy it from your experience's **Embed** section in the admin
> console, or from the embed-snippet endpoint:
>
> ```bash
> curl "https://admin.interakt.app/api/v1/embed-snippet?containerId=interakt-search" \
>   -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN"
> ```
>
> The examples below use placeholder attribute names — replace them with the ones in *your* snippet.
> For theming, layout, and modal-vs-inline options, see [Embed widgets](../../concepts/embed-widgets).

<!-- AUTHOR NOTE: confirm the real script `src` URL and the exact data-* attribute names
     (data-token / data-experience / data-container) against the live /embed-snippet output,
     and update every snippet in this Part to match. -->

### React (Vite / CRA single-page app)

Inject the script in an effect so it loads on the client, and remove it on unmount. The widget
de-duplicates itself, but guarding keeps React's lifecycle clean:

```jsx
// InteraktSearch.jsx
import { useEffect } from "react";

const SCRIPT_SRC = "https://admin.interakt.app/widget.js"; // use the URL from your snippet

export default function InteraktSearch() {
  useEffect(() => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.dataset.token = import.meta.env.VITE_INTERAKT_SEARCH_TOKEN;
    script.dataset.container = "interakt-search";
    document.body.appendChild(script);

    return () => script.remove();
  }, []);

  // Inline mode renders into this container. Omit it for modal/launcher mode.
  return <div id="interakt-search" />;
}
```

Render `<InteraktSearch />` wherever you want search. For chat, repeat with the chat experience's
token and a `interakt-chat` container (or no container, for the floating launcher).

### Next.js — App Router

Use [`next/script`](https://nextjs.org/docs/app/api-reference/components/script) with
`strategy="afterInteractive"`. Because the script touches the DOM, it must live in a **Client
Component** (a Server Component can't load it directly):

```tsx
// app/components/InteraktSearch.tsx
"use client";

import Script from "next/script";

export default function InteraktSearch() {
  return (
    <>
      <div id="interakt-search" />
      <Script
        src="https://admin.interakt.app/widget.js"
        strategy="afterInteractive"
        data-token={process.env.NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN}
        data-container="interakt-search"
      />
    </>
  );
}
```

Drop `<InteraktSearch />` into a layout to load it site-wide, or into a single page. `next/script`
ensures the tag survives hydration and loads only once across client navigations.

### Next.js — Pages Router

Same `next/script` component. Put it in `pages/_app.tsx` for every page, or in a single page:

```tsx
// pages/_app.tsx
import Script from "next/script";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://admin.interakt.app/widget.js"
        strategy="afterInteractive"
        data-token={process.env.NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN}
        data-container="interakt-search"
      />
    </>
  );
}
```

Add `<div id="interakt-search" />` on the page(s) where the inline widget should appear.

> **Environment variables.** The access token is public (origin-bound), so a browser-exposed var is
> fine: `VITE_*` in Vite, `NEXT_PUBLIC_*` in Next.js. Never put the **ingestion key** in any of these.

---

## Part 2 — Custom API integration

When the widget's UI isn't enough, call the endpoints directly. The token is public and origin-bound,
so calling **from the browser is fine** — no backend required.

### Search

Search is a plain `POST` that returns JSON. A small debounced hook keeps it responsive:

```tsx
// useInteraktSearch.ts
import { useEffect, useState } from "react";

const BASE = "https://admin.interakt.app";
const SLUG = "product-search"; // your search experience slug
const TOKEN = process.env.NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN!;

export function useInteraktSearch(query: string) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/api/v1/search-experiences/${SLUG}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": TOKEN,
          },
          body: JSON.stringify({ query, page: 1 }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Interakt ${res.status}`);
        const data = await res.json();
        setResults(data.hits ?? data.results ?? []); // see note on shape below
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250); // debounce

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return { results, loading };
}
```

```tsx
// SearchBox.tsx
import { useState } from "react";
import { useInteraktSearch } from "./useInteraktSearch";

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const { results, loading } = useInteraktSearch(query);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
      {loading && <p>Searching…</p>}
      <ul>
        {results.map((hit) => (
          <li key={hit.id}>
            <a href={hit.url}>{hit.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> **The exact request/response shape evolves** (facets, pagination, AI summaries, highlights, and
> the per-experience display configuration come back too). Get the current shape live from
> **Playground → Experience Search** in the admin, or the curl example on the experience's detail
> page. Full reference: [Calling the search API](../../guides/call-the-search-api).

### Chat (streaming)

The chat endpoint returns a **server-sent events (SSE)** stream. Because it's a `POST`, you can't use
the browser's `EventSource` (which is GET-only) — read the stream from `fetch` with a
`ReadableStream` reader and parse the SSE frames yourself:

```tsx
// useInteraktChat.ts
import { useRef, useState } from "react";

const BASE = "https://admin.interakt.app";
const SLUG = "support-bot"; // your AI experience slug
const TOKEN = process.env.NEXT_PUBLIC_INTERAKT_CHAT_TOKEN!;

export function useInteraktChat() {
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  // Persist the session id so multi-turn context is kept across messages.
  const sessionId = useRef<string>(crypto.randomUUID());

  async function send(message: string) {
    setBusy(true);
    setAnswer("");
    setSources([]);

    const res = await fetch(`${BASE}/api/v1/ai-experiences/${SLUG}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": TOKEN,
      },
      body: JSON.stringify({ message, sessionId: sessionId.current }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const evt = JSON.parse(line.slice(5).trim());

        switch (evt.type) {
          case "content":
            setAnswer((prev) => prev + (evt.text ?? evt.delta ?? ""));
            break;
          case "sources":
            setSources(evt.sources ?? []);
            break;
          case "done":
            setBusy(false);
            break;
          // "processing" / "tool_call" / "tool_result" — drive "thinking" UI here.
        }
      }
    }
    setBusy(false);
  }

  return { answer, sources, busy, send };
}
```

Key points:

- **Sessions.** Generate a `sessionId` once and re-send it on every turn so Interakt loads the
  conversation history. Store it (`useRef`, `localStorage`, or a cookie) and decide your own TTL for
  when to start a fresh session.
- **Event types.** Render `content` chunks as they arrive; use `processing` / `tool_call` /
  `tool_result` for "thinking" and tool-use indicators, and `sources` for citations.

> The event names and payload fields are the canonical list, but exact field names evolve — confirm
> against the live stream in the **Chat Playground** (browser dev tools → Network). Full reference:
> [Calling the chat API](../../guides/call-the-chat-api).

### Where to call from: browser vs. a Next.js Route Handler

Calling from the browser is the default and works because the access token is origin-bound. In
Next.js you *can* instead proxy through a **Route Handler** (`app/api/.../route.ts`) when you want to:

- keep response headers (rate-limit info) out of the client,
- add server-side caching for popular search queries, or
- attach the token server-side so it never appears in client bundles.

```ts
// app/api/search/route.ts  — optional server-side proxy
export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(
    "https://admin.interakt.app/api/v1/search-experiences/product-search/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": process.env.INTERAKT_SEARCH_TOKEN!, // server-only var
      },
      body,
    },
  );
  return new Response(res.body, { status: res.status, headers: res.headers });
}
```

> A **server-side** call bypasses CORS entirely — there's no Origin header to check — so the
> allowed-origins list only governs direct browser calls. When proxying the **chat** stream, return
> `res.body` straight through (as above) so the SSE stream isn't buffered.

---

## Verify the integration

1. **Widget:** load the page, open search/chat, run a query, and confirm you get your content back.
2. **Custom search:** type in your `SearchBox` and confirm ranked results render. A `200` with
   results in the Network tab confirms auth and origin are correct.
3. **Custom chat:** send a message and confirm tokens **stream in** (not all at once), then send a
   follow-up that depends on the previous turn to confirm the `sessionId` is being reused.

---

## Troubleshooting

- **CORS / "blocked by CORS policy".** Your origin isn't in the experience's **Allowed origins** —
  add it (including `http://localhost:<port>` for dev). The #1 issue for browser calls.
- **Widget script stripped or loads twice after navigation.** Use `next/script` (Next.js) or inject
  in `useEffect` with a de-dupe guard (React SPA) — don't drop a raw `<script>` into JSX.
- **HTTP 401.** Wrong token, revoked token, or a token for a *different* experience than the slug
  in the URL.
- **HTTP 429.** Rate-limited — back off and respect `Retry-After`.
- **Chat arrives all at once instead of streaming.** A proxy/CDN is buffering the SSE stream. If you
  proxy through a Next.js Route Handler, pass `res.body` through untouched and don't compress it.
- **Token vs. ingestion key.** The browser uses the public, origin-bound **access token**. The
  **ingestion key** (used to *write* documents) is a server secret — never ship it to the frontend.

---

## What's next

- [Embed widgets](../../concepts/embed-widgets) — full widget configuration and theming.
- [Calling the search API](../../guides/call-the-search-api) / [Calling the chat API](../../guides/call-the-chat-api) — the endpoint contracts.
- [Access tokens](../../concepts/access-tokens) — the credential and CORS model.
- Other frameworks — Vue/Nuxt, Astro/SvelteKit, and Vanilla JS guides are coming soon; the patterns
  above port directly.
