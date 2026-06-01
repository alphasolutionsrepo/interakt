---
sidebar_position: 7
---

# Experiences

An **experience** is the user-facing thing you've built — a search page, a chat window — and the access token that lets a website talk to it. Everything else in Interakt (indexes, tools, prompts, providers) is plumbing. The experience is what your users actually open in a browser.

There are two kinds:

- **Search experience** — a search box with filters and result cards, backed by one or more search indexes.
- **AI experience** (chat) — a chatbot, backed by an AI provider, that can use tools to answer.

You build them in the same place — sidebar → **Experiences**. The list shows both.

## Where to find this screen
Sidebar → **Experiences**.

## The list screen

A unified list of all your experiences with type filters at the top.

### Header
- **Title:** "Experiences."
- **New Experience** button — opens the create flow.

### Stats cards (four numbers)
- **Total** — count of experiences.
- **Active** — count with active toggle on, plus the percentage.
- **AI Experiences** — count of chat experiences.
- **Search Experiences** — count of search experiences.

### Filter and view controls
- **Type tabs** — All / AI / Search.
- **View toggle** — List (table) or Grid (cards). Grid is the default; list is denser.
- **Search input** — search by name or slug.
- **Status dropdown** — All / Active / Inactive.
- **Clear filters** button.
- **Refresh** button.

### Each row shows

| What | What it tells you |
|---|---|
| **Icon + name + slug** | The experience and how it's addressed in the API / URL. |
| **Type badge** | AI (amber) or Search (teal). |
| **Status badge** | Active (green) or Inactive (grey). |
| **Details** | For AI: pipeline mode + assigned-tools count. For Search: attached-indexes count. |
| **Created** | Date. |
| **⋮ menu** | View Details / Edit / Delete. |

Pagination at the bottom: *"Showing 1–20 of 35"* style.

## Creating an experience

Click **New Experience**. The first step asks which kind:

- **Search Experience** — search interfaces with filters, AI summaries, configurable result display.
- **AI Experience** — chatbots, with tools, guardrails, configurable personality.

Pick one and a wizard runs. See:

- [Search experiences](search-experiences) for the search wizard.
- [Chat experiences](chat-experiences) for the AI wizard.

## What every experience has

Regardless of type:

- A **name** and a **slug**. The slug is the URL path your users hit.
- An **access token** — the credential the embed widget or your custom frontend uses to call the API. Issued automatically on creation. Can be regenerated from the detail page.
- An **active/inactive** toggle. Inactive experiences exist but reject incoming traffic.
- An **allowed origins** list (CORS) — which domains are allowed to make browser requests to this experience. Empty means all origins are allowed.
- An **embed widget** configuration — theme, colours, layout, behaviour. The detail page has a card with a live preview and a **Copy** button for the snippet.
- A **delete** in the danger zone, requiring you to type the experience name to confirm.

Most pages and concepts described in [Search experiences](search-experiences) and [Chat experiences](chat-experiences) apply to both.

## Where to go next

- [Search experiences](search-experiences) — the search-side details.
- [Chat experiences](chat-experiences) — the AI-side details.
- [Display configuration](display-configuration) — how result cards are laid out.
- [Embed widgets](embed-widgets) — putting an experience on your site.
- [Access tokens](access-tokens) — how the credential model works.
