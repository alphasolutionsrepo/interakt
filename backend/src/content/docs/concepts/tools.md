---
sidebar_position: 13
---

# Tools

A **tool** is a capability you give a chat experience beyond "respond with text." Tools are how an AI chat can search your data, look up records, call your APIs, or run a sub-task. They're the most important thing to get right when you want a chatbot that's more than a glorified FAQ.

You define a tool once. Many chat experiences can use the same tool. Each chat experience picks which tools it wants from the catalog and can override how the tool is described *for that experience*.

## Where to find these screens
Sidebar → **Capabilities → Tools**.

> Looking for MCP? It's no longer a tool type — MCP servers are **Connections** that yield many tools at once. See [MCP Connections](mcp-connections).

## The list screen

The usual table-or-cards listing, with:

- **Stats cards** — total, active, data-source count, HTTP / other count.
- **Filters** — by type (Data Source, HTTP API, Web Search, AI Responder) and by status.
- **Search** — by name or slug.

Each row shows the tool's name, type, status, how many experiences use it, and when it was created. The 3-dot menu has View, Edit, Delete.

## Tool types

Interakt has four executor types.

### Data Source
Wraps a [data source](data-sources) — a search index, a file store, or a database. The most common kind, and the one that gets auto-generated when you create a search index.

Each data source can have up to four tools — one per **operation**:

| Operation | What it does | When the AI uses it |
|---|---|---|
| **search** | Full-text + vector query against the data source. | "What products do you have for cold weather?" — the obvious one. |
| **lookup** | Fetches one specific record by ID. | "Tell me about product SKU-12345" — the AI already has the ID. |
| **inspect** | Returns the schema of the data source — what fields exist, what types they are. | The AI uses this to figure out what it *can* ask before searching. |
| **enumerate** | Lists the distinct values of a facetable field. | "What brands do you carry?" — returns the list of distinct brand values. |

A well-tooled AI experience usually has all four. **Inspect** and **enumerate** are essential for letting the AI figure out the shape of your data — without them, it has to guess.

### HTTP API
Hits an arbitrary HTTP endpoint with templated headers, query params, and body. Used to call your own systems — order lookup, account status, inventory check, anything you have an API for.

Configuration:
- **Base URL** — the endpoint host.
- **Method** — GET / POST / PUT / DELETE.
- **Path template** — including `{{input.X}}` placeholders for variables the AI fills.
- **Headers** — including `Authorization: Bearer {{secret:X}}` to reference [secrets](secrets).
- **Body template** — for POST/PUT.
- **Timeout** — how long to wait for a response. Default 30 seconds.
- **Retries** — how many times to retry on failure.

### Web Search
Runs a live web search via Tavily, useful for grounding answers in current information when none of your data sources cover the topic. Single-purpose: in, query out, ranked results back.

Configuration:
- **API key** — referenced from the [Secrets vault](secrets) (`{{secret:tavily_api_key}}`).
- **Search depth** — `basic` (faster, cheaper) or `advanced` (more thorough).
- **Max results** — 1–20.
- **Include / exclude domains** — narrow the search to specific sites.

### AI Responder
Runs a smaller, scoped AI call as a sub-task. Useful for things like "summarise this document before passing it to the main model" or "translate this query into formal English first."

Configuration:
- **Instructions** — what the sub-AI should do.
- **Temperature** — how creative. Usually low.
- **Max tokens** — output cap.

## Creating a tool

Click **Create Tool**. The wizard:

1. **Pick the executor type** (Data Source / HTTP / Web Search / AI Responder).
2. **Fill in basic info** — name, slug, description.
3. **Fill in configuration** — type-specific, as above.
4. **Define the input schema** — what parameters does the AI need to provide when calling? JSON Schema format. Required fields are marked.
5. **Define the output schema** (optional) — validates the response from the tool.
6. **Write the AI description** — see [Description matters](#description-matters) below.

For data-source tools, all of this is auto-generated when you click **Create Tools** on the data source's detail page. Use the Edit screen to refine.

## The detail page

Header: name, type badge, status, **Activate / Deactivate** and **Edit** buttons.

Stats strip: type, status, used-in count, created date.

### Configuration card
Type-specific. For data-source tools: index ID, operation, max results, response fields, highlights toggle. For HTTP: base URL, method, timeout, retries.

### AI Description card
The text the AI sees describing this tool, with the input and output schema below. **The AI uses this to decide when to call the tool.** Get this right.

### Test Tool panel
A miniature playground — run the tool with sample input and see the response. Indispensable.

- For **search** tools: input a query.
- For **enumerate** tools: input a field name.
- For **lookup** tools: input a document ID.
- For **inspect** tools: no input.

Click **Run**. See the status, latency, and response body.

### Used in AI Experiences card
Lists every experience that has this tool assigned, with View links.

### Danger zone
Delete — disabled if any experiences depend on this tool.

## Description matters — the most important field

The AI decides whether to call a tool by reading its description. A vague description gets the tool ignored. A too-broad description gets it overused for every query.

**Bad:**
> Searches data.

**Good:**
> Searches the fashion catalog for products by name, brand, category, colour, size, or description. Use when the user asks about what products are available, for recommendations, or to find something with specific attributes. Don't use for order status, account questions, or shipping — those have their own tools.

The pattern:
1. **What** it does, specifically.
2. **When** to use it.
3. **When not** to use it.

For data-source tools, Interakt drafts a description automatically based on the data source's schema. Read it; refine if needed.

### Per-experience overrides

When you assign a tool to an experience, the experience can override the AI description for that one experience. This is in the **Assigned Tools** card on the chat experience detail page. Use it when:

- Two experiences use the same tool but in different contexts.
- One experience wants the AI to use the tool more aggressively, the other more carefully.
- You're describing the tool's purpose in customer-friendly vs internal language.

The override doesn't change the tool's global description — only the description shown to the AI when this specific experience is being run.

## Secrets in tool configs

Hard-coding API keys in tool configurations is bad. Use the [Secrets vault](secrets):

1. **Platform → Secrets Vault → New Secret.** Paste the key, give it a name (e.g. `orders_api_key`).
2. In the tool config, reference it as `{{secret:orders_api_key}}`.
3. At execution time, Interakt resolves the placeholder to the real value before making the call.

The decrypted value never appears in logs, traces, or the admin UI after it's saved.

## Template variables

Two kinds of templating in tool configs:

- `{{input.fieldName}}` — values the AI passes when invoking the tool. These come from the input schema.
- `{{secret:name}}` — references to the secrets vault.

Both work in URLs, headers, body templates, and query parameters of HTTP tools.

## Editing a tool

The edit screen has cards for:

- **Basic information** — name, description (note: the executor type cannot be changed).
- **Configuration** — type-specific.
- **AI settings** — AI description (required), input schema, output schema.
- **Display settings** — for tools returning record-shaped data, map fields to display roles (title, image, etc.) the same way as [display configuration](display-configuration).

Save Changes is greyed out until you change something.

## Testing tools

Beyond the in-page **Test Tool** panel, you can test how a tool behaves *in context* by going to the chat experience that uses it and trying questions in the Chat Playground. The Playground sidebar shows tool calls in real time — which tool was picked, what arguments the AI passed, what came back.

This is the most reliable way to know whether your tool's description is good — if the AI consistently picks the right tool for the right question, the description is doing its job.

## Common gotchas

- **Tool not getting called.** Almost always the description. Make it specific. Examples in the description help.
- **Tool getting called too eagerly.** Same — narrow the description. *"Use only when…"*.
- **`{{input.X}}` returning empty.** The AI didn't fill X. Mark it as required in the input schema, with a clear description, and the AI will fill it.
- **HTTP timeouts on slow upstreams.** Default is 30s. Raise in the tool config; for really slow ones, switch to an async pattern (return a job ID, have the AI say "I'll check back").
- **Forgetting `inspect` and `enumerate`.** A chat that can only `search` will struggle to handle "what brands do you carry?" — it has no way to enumerate. Add the missing operations from the data source detail.
- **Sharing one tool across very different experiences.** If two experiences use the same tool but should describe it differently to the AI, use per-experience description overrides instead of editing the tool's global description.

## Where to go next

- [Data sources](data-sources) — where most tools come from.
- [MCP Connections](mcp-connections) — bring whole tool catalogs in via one connection.
- [Chat experiences](chat-experiences) — assigning tools to a chat.
- [Secrets](secrets) — storing credentials referenced by tools.
- [Prompt templates](prompts) — the prompts that decide *which* tool gets called and how.
