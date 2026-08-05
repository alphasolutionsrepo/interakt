---
sidebar_position: 1
---

# Navigating the admin

The left sidebar groups screens by what you're doing. If you can't find something, it's probably in one of these groups.

The **?** icon in the top-right of every screen opens a help drawer with the docs page for whatever you're looking at. There are two tabs in the drawer:

- **Read** — the docs page for this screen.
- **Ask** — Interakt's own AI assistant, trained on these docs. Ask it anything in plain English.

## Sidebar groups

### Dashboard
The landing page. Shortcuts to the things you do most, a recent-activity feed, and a quick health check of providers and data sources.

### Experiences
Where your user-facing search pages and chat windows live. One list shows both kinds, with filters by type.

- **All experiences** — list, with stats and quick actions.
- **Create experience** — wizard, pick AI or Search and walk through the steps.

### Capabilities
Everything an experience runs on — the materials you compose to build a chat.

- **Data sources** — connections to where data lives (search indexes, external indexes, file stores, databases).
- **Search indexes** — the searchable copies of your data, with field mappings.
- **Tools** — capabilities you can hand to a chat experience (search, lookup, custom HTTP calls, AI sub-calls).
- **MCP Connections** — Model Context Protocol servers. One connection brings *many* tools to any experience you attach it to. See [MCP Connections](../concepts/mcp-connections).
- **Prompt templates** — the AI's instructions for each step of a chat. Versioned.

### Playground
The sandbox. Test queries, AI calls, and drop-in widgets without going through an access token — you're logged in as admin.

- **Drop-in Widget** — pick any experience and render its embed widget in a realistic preview frame.
- **AI Services** — try out an AI provider's text generation, chat, or embeddings.
- **Index Search** — query a search index directly, see raw results, debug ranking.

### Analytics
- **Overview** — totals, success rate, response times, quality scores, trending queries, top experiences.
- **Chat** — analytics assistant: ask questions about your usage, get answers + inline charts.
- **Traces** — the full record of every conversation: what the user said, which tools were called, latencies, and the final response.

### Platform
Cross-cutting infrastructure and admin.

- **AI providers** — manage connections to OpenAI, Anthropic, Azure, Ollama; set system defaults.
- **Secrets Vault** — encrypted vault for API keys, passwords, and tokens referenced by tools and MCP connections.
- **Settings**:
  - **Search settings** — global search behaviour: timeouts, hybrid-search weights.
  - **Cache management** — see what's cached, clear when you need to.
- **Background jobs** — run long-running work on demand or on a recurring schedule (e.g. refreshing AI insights), and review every run.
- **Health monitoring** — service status page.
- **User management** — create, edit, deactivate users; assign roles.
- **Initial setup** — the first-boot wizard. Comes back here to tear down or re-run the demo.

## The top header

- **? Help** — contextual docs + ask AI (see above).
- **Account menu** — your user, logout.
- Some screens show a **Refresh** button when they're showing live data.

## Recurring screen patterns

You'll see the same patterns across most screens, so once you've learned one list page, you've roughly learned all of them.

### List pages
Most list pages have:

- **Stats cards** at the top (totals, active count, etc.).
- A **search box** for filtering by name or slug.
- One or two **filter dropdowns** (type, status).
- A **view toggle** between table and card view.
- A **Refresh** button.
- A **New …** button on the right.
- Pagination at the bottom.

### Detail pages
- **Header** with the resource's name, type/status badges, and primary actions (Activate / Deactivate, Edit, Delete).
- **Stats strip** under the header (a few key numbers).
- **Cards** for different sections of the configuration — each can be collapsed.
- **Danger zone** at the bottom — destructive actions (delete, reset).

### Wizard / create flows
- A **stepper** at the top showing where you are.
- **Back** / **Next** buttons at the bottom.
- The final step has **Create** (or **Save**) instead of Next.
- Each step validates before letting you advance.

### Edit pages
Same fields as the create wizard, usually re-arranged into **tabs**. The header has **Cancel** and **Save Changes**. Save Changes is greyed out until you actually change something.

## Active / inactive

Almost every resource you can create (experiences, indexes, data sources, tools, users) has an **Active / Inactive** toggle. Inactive resources still exist — you can edit them, read their config — but they don't accept traffic. Inactive experiences won't respond to requests on their public URL.

This is your "soft delete" switch. Use it when you want to take something offline without losing the config.

## Where to go next

- [Dashboard](dashboard) — what the home page shows.
- [Search indexes](../concepts/search-indexes) — start of the data side.
- [Experiences](../concepts/experiences) — start of the user-facing side.
