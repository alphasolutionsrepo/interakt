---
sidebar_position: 16
---

# AI providers

An **AI provider** is the service that runs the AI models Interakt uses — for generating embeddings (which power semantic search), for running chats, for AI summaries. Without at least one provider configured, you can do keyword search but not semantic search or chat.

Interakt supports several providers. You can configure as many as you want and pick which one each experience or index uses.

## Where to find this screen
Sidebar → **Administration → Admin → AI Providers**.

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
- **Actions** — per-row dropdown: Edit / Manage Models / Test Connection / Discover Models / Enable-Disable.

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

## Connection types

A provider has a name you choose and a **connection type**: the API it speaks. Add as many providers as you like, several of the same type included, for example OpenAI and your own AI gateway side by side.

| Connection type | Speaks | Use it for |
|---|---|---|
| **OpenAI-compatible** | OpenAI's `/v1` API (chat, embeddings, `/v1/models`) | OpenAI, self-hosted AI gateways and routers, vLLM, LM Studio and other OpenAI-style services |
| **Ollama** | Ollama's own API | Ollama on your machine or a server |

## Adding a provider

Click **Add Provider**, then:

- **Display name** — any name, for example "Campus AI". The **provider key** is made from it; you can change the key before saving.
- **Connection type** — OpenAI-compatible or Ollama.
- **Base URL** — for OpenAI-compatible, the address up to and including `/v1` (`https://api.openai.com/v1`, or your gateway's, such as `https://ai.example.edu/v1`). For Ollama, its address without `/v1` (`http://localhost:11434`).
- **Authentication** — **API key** sends it as `Authorization: Bearer <key>`; **None** for a service that needs no key. Once saved, the key is never shown again. When you edit the provider, leave the key empty to keep it; a base URL on another server needs the key typed again.

### Models
**Discover Models** reads the models the provider offers: Ollama's pulled models, or an OpenAI-compatible service's `/v1/models` list. New text and embedding models are added, with the context size the service reports. For Ollama, models it no longer has are hidden. For an OpenAI-compatible service, models an earlier discovery added are hidden once it stops listing them; models you added by hand stay. A new embedding model's dimensions are read from one short embedding request; when the service doesn't answer it, set them on the model. You can add any model by hand.

### Rate limits
When a provider answers "too many requests" with a `Retry-After` time, Interakt waits that long before trying again, for answers and streamed answers alike. If it asks for a longer wait than Interakt's longest retry wait (30 seconds), the request fails at once with the provider's message instead of retrying.

### After saving
Interakt runs a **Test Connection** check immediately — pings the provider with a minimal request to confirm credentials work. If the check fails, the provider stays disabled and the dialog shows the error.

## Managing models

Click the **Manage Models** option on any provider row. The dialog shows:

- The list of models registered for this provider.
- Each model with its name, purpose (text-generation / embedding / chat), and key configuration (context window, dimensions for embeddings).
- An **Add model** button to add more.
- **Remove model** per row.
- A **Discover Models** button that reads the models the provider offers again.

You only need to register models you actually want available in the rest of the UI's dropdowns. Don't register every model on the provider's catalog — you'll never use most of them.

## Testing a provider

Either the **Test Connection** option in the row actions, or via the [Test → AI models](playground). The test sends a small request and reports success / failure with latency.

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
- [Test → AI models](playground) — testing provider responses.
