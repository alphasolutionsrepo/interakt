---
sidebar_position: 2
---

# Architecture

This is the architecture overview: how Interakt's pieces fit together. The previous page named the building blocks; this one shows how they relate, so the rest of the docs feel less like a glossary and more like a system.

Read this before you start clicking around. Ten minutes here saves an hour of wandering through screens trying to figure out which thing connects to which.

## The shape of an Interakt app

Everything in Interakt eventually exists to serve one of two surfaces your end-users actually see:

```
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │     Search Experience    │        │     Chat Experience      │
   │                          │        │                          │
   │   ┌────────────────┐     │        │  Hi, how can I help?     │
   │   │ Search…      🔍 │     │        │                          │
   │   └────────────────┘     │        │  ┌────────────────────┐  │
   │                          │        │  │ Type a message…    │  │
   │   • Result one           │        │  └────────────────────┘  │
   │   • Result two           │        │                          │
   │   • Result three         │        │                          │
   └──────────────────────────┘        └──────────────────────────┘
                ▲                                    ▲
                │                                    │
                │       embedded as a widget         │
                │       on your customers' site      │
                └────────────────┬───────────────────┘
                                 │
                                 │  one snippet, paste once
```

Both are configured in the admin, both ship as drop-in widgets. The difference is what's behind them.

## What's behind each

A **Search Experience** is light: it's a configured query layer over a single index.

```
    Your data  ──►  Search Index  ──►  Search Experience  ──►  Widget
                          ▲
                          │
                   defines what's
                   searchable, filterable,
                   shown in results
```

A **Chat Experience** is heavier: it composes a model, a persona, a set of capabilities, and a set of guardrails into one personality.

```
                  ┌───────────────────────────────────────────┐
                  │              Chat Experience              │
                  │                                           │
                  │   Brain         Voice         Rules       │
                  │   (model +      (tone +       (what to    │
                  │    prompts)     persona)       refuse)    │
                  │                                           │
                  │                Capabilities               │
                  │   ┌─────────────────────────────────┐     │
                  │   │   Tools  +  MCP Connections     │     │
                  │   └─────────────────────────────────┘     │
                  └───────────────────────────────────────────┘
                                       │
                                       ▼
                                     Widget
```

The Chat Experience is the **composition surface**. It's where you decide *who the assistant is*, *what it knows about*, *what it can do*, and *what it shouldn't do*. Everything else in this doc is a thing that plugs into here.

## Search Indexes: where the searchable copy of your data lives

An index is your data, restructured for fast querying. One index per "kind of thing" — your product catalog, your support articles, your knowledge base.

> **Search experiences need one.** That's the whole point.
>
> **Chat experiences don't strictly need one — but you almost always want one.**

A chat assistant can technically answer with just a model and a persona. But asking a language model to "know" your catalog of 50,000 products is a recipe for hallucinations, latency, and cost: every question goes to the LLM in full, the LLM tries to reason about data it never reliably saw, and you pay for the privilege.

An index changes the math. The chat looks up exactly what it needs ("ten warm jackets under $200") and only the relevant ten records reach the LLM. Faster, cheaper, grounded.

In short: **build an index when you have a body of data the chat will need to reach into.** Skip it if your chatbot just calls live APIs (order status, account info) and never needs to search a catalog.

## Tools: a chat's hands

A tool is something a chat experience can *do* — look up a record, search an index, call an API, run a sub-task. The LLM decides which tool to use based on the user's question and the tool's description.

There are four tool types:

| Type | What it does |
|---|---|
| **Data Source** | Operates on a search index — `search`, `lookup`, `inspect`, `enumerate`. |
| **HTTP API** | Hits one of your endpoints — order status, account info, anything you have an API for. |
| **Web Search** | Pulls live results from the open web. |
| **AI Responder** | Sub-LLM call for specialized reasoning (summarize, translate, classify). |

A typical chat has a handful of tools: usually the four data-source tools for the index it's grounded in, plus maybe a couple of HTTP tools for your business systems.

## Data Sources: the shortcut

Building an index AND the four tools to query it by hand would be tedious. So Interakt has a shortcut: a **Data Source**.

You point a Data Source at where your data lives (a search index, a file store, an external Elasticsearch, etc.) and Interakt does two things automatically:

```
                        ┌──────────────┐
                        │  Data Source │
                        │              │
                        │  (where your │
                        │  data lives) │
                        └──────┬───────┘
                               │
                  ┌────────────┴───────────────┐
                  ▼                            ▼
          ┌──────────────┐          ┌──────────────────┐
          │ Search Index │          │   Four Tools     │
          │  (built)     │          │  search / lookup │
          │              │          │  inspect / enum  │
          └──────────────┘          └──────────────────┘
```

That's the "Fashion Product Assistant" path in the demo — one Data Source spawns an index and four tools, and the chat experience just picks them. You can also build tools by hand for things a Data Source doesn't cover.

## MCP Connections: borrowing whole tool catalogs

**Model Context Protocol** is an open standard for AI tool servers. Lots of teams already publish MCP servers — Atlassian, GitHub, your internal CRM, documentation sites like DeepWiki. Instead of recreating that integration as a hand-built HTTP tool, you point Interakt at the server's URL once and **all of its tools come along**.

```
                ┌───────────────────────────┐
                │    External MCP Server    │
                │                            │
                │   Tool 1  Tool 2  Tool 3   │
                │   Tool 4  Tool 5  …        │
                └─────────────┬──────────────┘
                              │
                              │  one connection,
                              │  all tools come along
                              ▼
                ┌───────────────────────────┐
                │      MCP Connection       │
                │   (lives in Capabilities) │
                └─────────────┬──────────────┘
                              │
                              │  attach to any
                              │  chat experience
                              ▼
                ┌───────────────────────────┐
                │     Chat Experience       │
                └───────────────────────────┘
```

The catalog refreshes when you tell it to. You can also restrict which of a connection's tools a given experience exposes — Atlassian publishes 20 tools, your support bot only needs 3.

## Bringing it all together with one example

Imagine you're building a **Fashion product assistant** chat for your store.

1. You add your product catalog as a **Data Source**.
   That auto-generates a **Search Index** and four **Tools** (search, lookup, inspect, enumerate).
2. You have an internal **order-status API**. You build a custom **HTTP Tool** that calls it.
3. Your support team's runbooks live in **Confluence**. You add the **Atlassian MCP Connection** so the chat can search those too.
4. You create a **Chat Experience** called "Fashion assistant". In its config you:
   - Pick the OpenAI **AI Provider** + GPT-4o model.
   - Set a friendly **persona** with system instructions like "always cite the product".
   - Attach the four product tools, the order-status tool, and the Atlassian MCP connection.
   - Add a **guardrail**: refuse anything off-topic.
5. You paste the **widget snippet** on your storefront.

A customer asks *"Is the navy peacoat in stock in medium, and what's my order status?"*. The chat plans its turn, calls the product `lookup` tool (peacoat) and the order-status HTTP tool (their account), gets two grounded responses back, and replies — citing both.

Every piece you saw above had a role:

| Piece | Role in that example |
|---|---|
| **Data Source** | Auto-built the index and the four tools over the catalog. |
| **Search Index** | Made "is the navy peacoat in stock?" answerable in milliseconds. |
| **Tools** | Gave the chat its hands — searching, looking up, calling APIs. |
| **MCP Connection** | Brought a whole external catalog (Confluence) into the chat without bespoke wiring. |
| **AI Provider** | Ran the model that decided which tools to call and wrote the final answer. |
| **Chat Experience** | The composition — picked everything above and wired persona, guardrails, and the public widget on top. |
| **Widget** | The thing your customer actually saw. |

## A mental rule of thumb

If you remember one shape, remember this:

> **Search Experiences search an index.**
>
> **Chat Experiences compose: model + persona + capabilities + guardrails — and a widget at the end.**
>
> **Capabilities = Tools (one at a time) + MCP Connections (whole catalogs).**
>
> **Data Sources are a shortcut to skip building indexes and tools by hand.**

Everything else in the admin UI is a knob on one of those.

## Where to go next

- [What is Interakt](what-is-interakt) — the building-blocks glossary, if you want term-by-term definitions.
- [Initial setup](initial-setup) — the one-click demo build, so you can see the whole picture working before you wire your own data.
- [Your first experience](first-experience) — a 15-minute end-to-end walkthrough.
- [Chat experiences](../concepts/chat-experiences) — the composition surface in depth.
- [MCP Connections](../concepts/mcp-connections) — the standardised tool-catalog plug-in.
