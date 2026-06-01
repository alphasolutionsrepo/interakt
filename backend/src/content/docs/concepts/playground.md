---
sidebar_position: 19
---

# Playground

The **Playground** is the admin-side test harness. It lets you try search queries, AI calls, and full experience requests **without going through an access token** — you're already logged in as admin, so you can iterate fast.

It's the place to go when you've changed something and want to see if it worked, before you expose it to real users.

## Where to find it
Sidebar → **Playground**.

Three sub-screens:

- **AI Services** — direct calls to your AI providers (text generation, chat, embeddings).
- **Index Search** — search a specific index directly, without going through a search experience.
- **Experience Search** — call the same API your users will, using a search experience's slug.

## AI Services Playground

Tests AI provider connections end-to-end.

### Where to find it
Sidebar → **Playground → AI Services**.

### Tabs

#### Text Completion
- **Input** — a prompt textarea.
- **Output** — the AI's continuation, streamed.
- **Model selector** — pick which model to use.
- **Provider selector** — which provider to call.

Use this to confirm a model can respond at all, or to compare two models on the same prompt.

#### Chat
- **Conversation panel** — a multi-turn chat interface. Each turn shows latency and token usage.
- **Model selector** — pick model.
- **System message field** — set the system prompt to test how it shapes responses.

Use this to A/B different system prompts on the same model.

#### Embeddings
- **Input** — text to embed.
- **Output** — the vector (or its dimensions + a preview).

Useful for verifying that the embedding model is returning sensible dimensions and that batch embedding is fast enough for your scale.

## Index Search Playground

Search a raw index directly. The same Elasticsearch / Azure query your tools and experiences run, but with no experience-layer filtering or display config applied — just the raw hits.

### Where to find it
Sidebar → **Playground → Index Search**.

### Layout
- **Index selector** — pick which index.
- **Query input** — type the search query.
- **Filters and facets editor** — apply field-value filters (`category = shoes`, `price < 100`).
- **Run** button — runs the search.
- **Results table** — rank, document, score, highlights.

### When to use

- **Confirming a document is in the index** — search for its unique identifier, see whether it comes back.
- **Debugging relevance** — search a query and look at the scores. Are the right things at the top? If not, the index field configuration or the synonyms / boost values need work.
- **Checking highlights** — confirm that searching for "shoe" highlights "shoe" in the description.

This is the lowest-level test surface — closest to the raw engine.

## Experience Search Playground

Tests a search experience end-to-end. Same code path your users will exercise, but the request is authenticated by your admin session, not by an access token.

### Where to find it
Sidebar → **Playground → Experience Search**.

### Layout
- **Experience selector** — pick a search experience.
- **Query input** — search query.
- **Filters / sort / pagination** — same options the public API exposes.
- **Run** — issues the request.
- **Results display** — formatted by the experience's display configuration, exactly as the widget would render them.

### When to use

- **End-to-end smoke test** after changing an experience.
- **Confirming display config** — does the title field map correctly? Are images loading?
- **Confirming AI summary** — does it generate? Does it cite sources?
- **Validating multi-index ranking** — search a term that appears in both indexes; see how they blend.

This is the test most worth running before activating an experience.

## What the playground is *not*

- **Not a production-traffic dashboard.** Use [Analytics](analytics) for that.
- **Not a way to test access tokens.** The playground bypasses tokens — to confirm a real client can call your API, use curl or the widget itself.
- **Not a debug log for live conversations.** Use [Conversations / Traces](analytics) under Analytics.

## Common gotchas

- **Forgetting that the Playground is unauthenticated relative to access tokens.** A request that works in the Playground may still fail from a real client if the token is wrong or the origin is blocked.
- **Comparing Playground results to widget results** — and they look different. They usually shouldn't be, but the widget reads display configuration; the raw Playground shows everything. Toggle to Experience Search if you want the apples-to-apples.

## Where to go next

- [AI providers](ai-providers) — test connections start here.
- [Search experiences](search-experiences) / [Chat experiences](chat-experiences) — what you're testing.
- [Analytics → Conversations / Traces](analytics) — for real production behaviour.
