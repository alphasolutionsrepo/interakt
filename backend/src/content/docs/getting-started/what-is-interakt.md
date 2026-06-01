---
sidebar_position: 1
---

# What is Interakt?

Interakt is a platform for putting **search** and **AI chat** in front of your users without having to assemble the pieces yourself.

Underneath, it's a curated stack — a search engine, an AI provider connection, a chat pipeline, a prompt library, an analytics database — but you don't see those individually. You see a dashboard where you point Interakt at your data, decide how it should behave, and copy a snippet into your website when you're ready.

## The building blocks

You'll see these terms throughout the admin UI. Knowing what each one is makes the rest of the docs make sense.

### Data source

A *data source* is the connection to where your data actually lives. The most common kinds:

- A **search index** inside Interakt (the default — you upload your data into Interakt).
- An **external search index** (Elasticsearch or Azure AI Search — already running elsewhere).
- A **file store** (documents, PDFs, markdown — Interakt extracts and embeds the text).

Data sources are the raw plumbing. You usually create them once and forget about them.

### Search index

A *search index* is where your records get organised so they can be searched fast. One index typically holds one "kind" of thing — your product catalog, your support articles, your knowledge base.

You decide which **fields** are searchable (used in keyword matching), which are **facetable** (used as filter chips like brand, colour, category), which are **sortable**, and which are returned in results. You also decide whether the index is **keyword-only**, **meaning-based**, or **both** (hybrid).

### Experience

An *experience* is what your users actually interact with. There are two kinds:

- A **search experience** — a search page or search box, with filters and result cards.
- An **AI / chat experience** — a chat window backed by a chatbot that knows your data.

Each experience has its own settings (which index to search, what the chatbot's personality is, what tools it can use, what filters to show) and its own embeddable widget you paste into your site.

### Tool

A *tool* is a capability you give an AI experience — usually "look something up" or "do something". Out of the box, every search index comes with four tools: **search** (find by text), **lookup** (fetch a specific record), **inspect** (see what fields exist), and **enumerate** (list the possible values of a field). You can also build custom tools that call your own HTTP endpoints.

When a chatbot answers a user, it can decide to call one of these tools to get fresh information from your data before responding.

### Prompt template

A *prompt template* is the AI's instructions for one step of a conversation — for example, "decide whether to call a tool", "extract the parameters", "write the final answer". Interakt ships with a working set of templates for every step. You can edit them, version them, and roll back if a change makes things worse.

### AI provider

An *AI provider* is the cloud or local service that runs the large language model — OpenAI, Anthropic, Azure OpenAI, or Ollama (on your own machine, free). You can configure several and pick which one a given experience uses.

### Secret

A *secret* is a credential you don't want lying around in plain text — an API key, a password, a token. You store it once in the **Secrets vault** and reference it by name from tool configurations. Interakt encrypts it at rest.

## How the pieces fit together

A typical setup looks like this:

```
data source  →  search index  →  experience  →  widget on your site
                       ↑
                  (also exposed as tools)
                       ↓
                AI / chat experience  →  widget on your site
```

You connect a data source, populate a search index, then build one or more experiences on top of it. The chat experience can call the search tools to answer questions from your data.

## What you'll do, in roughly the order you'll do it

1. **Configure an AI provider** (Platform → AI Providers). Without one, you can do keyword search but not meaning-based search or chat.
2. **Connect a data source** or **load data into a search index**.
3. **Define the index fields** — what's searchable, what's filterable, what's shown in results.
4. **Build an experience** — a search page, a chat window, or both.
5. **Embed the widget** on your site, or call the API directly.
6. **Watch analytics** and refine — adjust synonyms, prompts, filters, display.

The [initial-setup](initial-setup) wizard does steps 1–4 in one click using the bundled Fashion Catalog demo, so you can see the whole thing working before you wire up your own data.

## What's next

- [Initial setup](initial-setup) — the one-click demo build and how to switch it to your own provider.
- [Your first experience](first-experience) — a 15-minute walkthrough end-to-end, with your own data.
