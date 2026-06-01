---
sidebar_position: 16
---

# AI providers

An **AI provider** is the service that runs the AI models Interakt uses — for generating embeddings (which power semantic search), for running chats, for AI summaries. Without at least one provider configured, you can do keyword search but not semantic search or chat.

Interakt supports several providers. You can configure as many as you want and pick which one each experience or index uses.

## Where to find this screen
Sidebar → **Administration → Platform → AI Providers**.

(The Initial Setup wizard sets up your first provider; this screen is where you manage them after.)

## The list screen

Two-column layout.

### Left column — providers table

The table of providers with these columns:

- **Provider** — name and provider key.
- **Type** — Cloud or Local.
- **Status** — Enabled or Disabled.
- **Models** — how many models are configured for the provider.
- **Last Check** — when Interakt last verified it could reach this provider.
- **Actions** — per-row dropdown: Edit / Manage Models / Test Connection / Discover Models (Ollama) / Enable-Disable.

### Right column — System Configuration

The **System Defaults** card. This is where you pick the default provider + model for each purpose:

- **Text generation default** — fallback for ad-hoc AI calls.
- **Embedding default** — used by new indexes and the file-store data sources. Lock this in early — switching later requires reindexing.
- **Chat default** — used by new chat experiences.

Every new experience and index is pre-populated with these defaults. Individual resources can override them.

### Top toolbar
- **Search input** — filter by name or key.
- **Type dropdown** — All / Cloud / Local.
- **Status dropdown** — All / Enabled / Disabled.
- **Refresh** button.
- **Add Provider** button.

## Supported providers

| Provider | Type | What you need | Default for |
|---|---|---|---|
| **OpenAI** | Cloud, paid | API key from openai.com | gpt-4o (chat), text-embedding-3-small (embedding) |
| **Anthropic** | Cloud, paid | API key from console.anthropic.com | Claude models (chat only — no embeddings) |
| **Azure OpenAI** | Cloud, paid | API key, endpoint, deployment names | Whatever you've deployed |
| **Google Vertex AI** | Cloud, paid | Project ID, credentials JSON | Gemini models |
| **Ollama** | Local, free | Ollama running locally with models pulled | Whatever you've pulled |
| **HuggingFace** | Cloud, paid (some) | API token | Open-source models on HF Inference |

Each provider has slightly different configuration. The provider dialog adapts to the type you pick.

## Adding a provider

Click **Add Provider** → pick the provider type from the dropdown.

### Cloud providers (OpenAI, Anthropic, Azure, Google, HuggingFace)
- **API key** — paste it. Stored encrypted at rest. Once saved, the field shows "•••" and never displays the key again.
- **Base URL** — for self-hosted or Azure: the endpoint. For OpenAI: leave blank.
- **Display name** — what shows in the UI. Defaults to the provider name; useful if you have multiple instances of the same provider.
- **Model configuration** — what models to make available. Some providers have an auto-list; others are manual.

### Local provider (Ollama)
- **Base URL** — `http://localhost:11434` is the default. Change if Ollama is on another machine.
- **Discover Models** — clicks Ollama's API to list every model you've pulled. Tick the ones you want to expose.

### After saving
Interakt runs a **Test Connection** check immediately — pings the provider with a minimal request to confirm credentials work. If the check fails, the provider stays disabled and the dialog shows the error.

## Managing models

Click the **Manage Models** option on any provider row. The dialog shows:

- The list of models registered for this provider.
- Each model with its name, purpose (text-generation / embedding / chat), and key configuration (context window, dimensions for embeddings).
- An **Add model** button to add more.
- **Remove model** per row.
- For Ollama: a **Discover Models** button that re-checks the local Ollama server and offers any newly pulled models.

You only need to register models you actually want available in the rest of the UI's dropdowns. Don't register every model on the provider's catalog — you'll never use most of them.

## Testing a provider

Either the **Test Connection** option in the row actions, or via the [Playground → AI Service](playground). The test sends a small request and reports success / failure with latency.

This is the first thing to try when something feels broken — confirm the provider is reachable and authenticated, then look elsewhere.

## Enabling / disabling a provider

A disabled provider stays configured but can't be selected when creating new experiences or indexes. **Existing** experiences using a disabled provider keep working — disable is forward-only.

Disable a provider when:
- You're rotating to a different one and want to make sure nothing new picks up the old one.
- Your credentials lapsed and you want the failure to be loud (the provider's dropdown won't show it).

## How an experience picks its provider

When a chat experience is created, it gets:
- A **provider** (default: system default chat provider, or override).
- A **model** (default: the provider's default chat model, or override).

These are stored on the experience. You change them via the experience's Edit page → AI provider & model section.

Same for indexes — the embedding provider is set at creation and locked.

## System defaults — why they matter

Setting the right system defaults early saves rework later.

- The default embedding provider determines the vector size of every new index. If you create indexes with Ollama (768-dim) and later want to switch to OpenAI (1536-dim), you have to rebuild every index from scratch. Better to lock this in deliberately when you set up.
- The default chat provider is what every new chat experience starts with. Easy to override per experience, but you save time by picking the right default.

The recommended defaults for most teams:
- Embedding: OpenAI `text-embedding-3-small`. 1536-dim, fast, cheap, reliable.
- Chat: OpenAI `gpt-4o` for quality, `gpt-4o-mini` for cost-sensitive applications.

Use Ollama for development and demos where data sensitivity or budget rules out the cloud.

## Common gotchas

- **Ollama isn't running.** Enabling the Ollama provider fails. Run `ollama serve` or `ollama list` to wake it.
- **Ollama models not pulled.** The provider shows enabled but no models are usable. Pull what you need: `ollama pull llama3`, `ollama pull nomic-embed-text`.
- **API key wrong or rate-limited.** Interakt fails validation. Double-check in the provider's dashboard.
- **Switching providers on an existing index.** Not allowed in-place. Different providers produce different vector sizes — see [Rebuilding an index](rebuilding-an-index).
- **Multiple providers configured but the wrong one is the default.** Check **System Defaults** in the right column. Easy to miss.

## Where to go next

- [Secrets](secrets) — sometimes provider credentials are referenced through secrets.
- [Search indexes](search-indexes) — picking an embedding model.
- [Chat experiences](chat-experiences) — picking a chat model.
- [Playground → AI Service](playground) — testing provider responses.
