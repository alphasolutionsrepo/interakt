---
sidebar_position: 14
---

# MCP Connections

An **MCP Connection** is a link to an external [Model Context Protocol](https://modelcontextprotocol.io) server. One connection brings *many* tools to any chat experience you attach it to — you don't create a Tool per MCP capability.

This is a different shape from regular [Tools](tools). Tools are individual capabilities you configure one-at-a-time. An MCP Connection is a single configured server that yields whatever tool catalog the server publishes — and the catalog can change without you re-configuring anything.

## Why it's not just a tool type

Every MCP-using app (Claude Desktop, Cursor, ChatGPT connectors, every modern AI IDE) treats MCP this way for a reason. The protocol is *designed* for live discovery:

- A single MCP server (e.g. Atlassian) typically exposes 5–20+ tools.
- Configuring each one as a separate Interakt tool would be tedious and would silently rot when the server adds or removes capabilities.
- The protocol provides `tools/list` precisely so clients can fetch the catalog at runtime. Use what's there.

So Interakt persists the **connection** (URL, transport, auth) and reads the catalog on demand. Tools materialize as in-memory definitions at chat time — they never become rows in the Tools table.

## Where to find these screens

Sidebar → **Capabilities → MCP Connections**.

## Creating a connection

Click **New Connection**. The form has:

- **Name** and **slug** — how this connection appears in the admin.
- **Description** (optional).
- **Server URL** — the MCP endpoint. e.g. `https://mcp.deepwiki.com/mcp`.
- **Transport** — `streamable-http` (modern, recommended) or `sse` (legacy).
- **Auth type**:
  - **None** — public servers.
  - **Bearer** — bearer token from the [Secrets vault](secrets) (`secretRef: my_mcp_token`).
  - **Header** — custom header name + secret value (e.g. `X-API-Key`).

On save, Interakt immediately probes the server: `initialize` → `tools/list`. The discovered catalog is cached on the connection record. If the probe fails, the connection saves anyway with status `error` so you can fix the config without re-entering everything.

### Free MCP servers to try

The create form has presets for three public, no-auth MCP servers — useful for testing the wiring before plugging in your own:

| Server | URL | What it exposes |
|---|---|---|
| **DeepWiki** | `https://mcp.deepwiki.com/mcp` | AI Q&A over public GitHub repos (`ask_question`, `read_wiki_structure`, `read_wiki_contents`). |
| **Context7** | `https://mcp.context7.com/mcp` | Library / framework documentation. |
| **GitMCP** | `https://gitmcp.io/docs` | Any GitHub repository. |

## The detail page

Header has **Test** and **Sync** buttons.

- **Test** — probes the server *without* persisting the result. Use to check a config you're about to edit.
- **Sync** — probes and **writes** the new tool catalog to the connection. Use after you've changed something server-side and want Interakt to see the new tools.

Below:

- **Connection card** — URL, transport, auth type. Reachability and last health check.
- **Server info** — name, version, MCP protocol version (populated from the `initialize` response).
- **Discovered tools** — one expandable row per tool with description, input schema, and output schema. This is the catalog as the server published it.

## Attaching to an experience

Two ways:

1. **From the chat experience create wizard** — step 2 (Capabilities) has an "MCP Connections" section alongside the regular Tools picker. Check the connections you want.
2. **From the chat experience detail page** — open the **MCP Connections** card, click **Attach Connection**, pick from the list.

Once attached, the experience exposes **every** tool from that connection to the LLM by default.

### Restricting which tools

On the attachment, you can expand the row and tick a subset of the connection's tools — only the ticked ones will be exposed for this experience. Useful when:

- The MCP server has 20 tools and your chat only needs 3.
- One server hosts both safe (read) and risky (write) capabilities.
- You want a more focused tool list to help the LLM pick correctly.

The setting is per-attachment, so the same connection can expose different subsets to different experiences.

## How tools appear to the AI

MCP tools are presented to the LLM with synthetic names like:

```
mcp__<connection-slug>__<tool-name>
```

For example: `mcp__deepwiki__ask_question`. The connection slug is included so the model can disambiguate when multiple connections are attached.

The tool's `description` and `inputSchema` flow through unchanged from what the server published — same as any other tool definition.

## Refreshing the catalog

MCP servers can add, remove, or change tools at any time. Interakt does **not** auto-sync; the catalog is whatever was last persisted by a `Sync` (or by the initial probe on connection create).

When to re-sync:

- The MCP server team tells you they shipped a new tool.
- You suspect a tool is missing or out of date.
- You changed auth and want to verify the new credentials work.

Just hit **Sync** on the connection's detail page. The new catalog is picked up by all attached experiences on their next chat turn.

## Auth that needs OAuth

Some MCP servers (Atlassian, Slack via their hosted endpoints) require OAuth, not a bearer token. **OAuth flows are not yet implemented** — the connection schema supports bearer/header out of the box, but the OAuth dance (registering a client, exchanging an auth code, refreshing tokens) hasn't been built.

Workaround: if the server supports a long-lived personal access token via header auth, configure that instead.

## Common gotchas

- **"Repository not found" / "tool returned error"** — the MCP server itself returned an error. Interakt forwards it. Check the server's docs (e.g. DeepWiki only knows repos it has indexed — others 404).
- **Catalog looks stale.** Hit **Sync**. Cache only refreshes on explicit sync.
- **Tool not called by the AI.** The system instructions need to *invite* tool use, especially when the chat is grounded in your data sources. See [Tools — Description matters](tools#description-matters-the-most-important-field).
- **CORS / allowed origins.** MCP calls happen server-to-server (from Interakt to the MCP host), not browser-to-MCP. CORS doesn't apply.
- **Connection healthy, but no tools listed.** The server returned an empty `tools/list`. Either the server has no tools yet, or auth limited what's visible. Check the **Test** result.

## What's persisted vs. live

| Thing | Where it lives |
|---|---|
| Server URL, transport, auth config | Connection row (`mcp_connections`). Persisted. |
| Discovered tool catalog (snapshot) | Same row, `discovered_tools` JSON. Refreshed by **Sync**. |
| Per-experience attachment + allow-list | Junction (`ai_experience_mcp_connections`). Persisted. |
| Tool definitions sent to the LLM at chat time | Built in-memory from the cached catalog. Not persisted as Tool rows. |

## Where to go next

- [Tools](tools) — the regular tool model: one tool, one configuration.
- [Chat experiences](chat-experiences) — attaching capabilities to a chat.
- [Secrets](secrets) — storing bearer tokens referenced by MCP auth.
