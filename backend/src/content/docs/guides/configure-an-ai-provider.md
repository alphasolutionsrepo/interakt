---
sidebar_position: 6
---

# Configure an AI provider

You need at least one AI provider before you can create a semantic / hybrid index or any chat experience. This is the click-through. The concept page on [AI providers](../concepts/ai-providers) covers what each provider is good for.

The fastest path is the [Initial Setup wizard](../getting-started/initial-setup), which configures your first provider. This guide is for adding more providers afterwards, or for setting one up by hand.

## Where to go

Sidebar → **Administration → Admin → AI Providers**.

## OpenAI (cloud, paid — the recommended default)

### What you need
- An API key from [platform.openai.com](https://platform.openai.com). Dashboard → API keys → Create new. **Copy it now — you can't see it again.**
- Billing set up (the free tier doesn't include the chat models most experiences use).

### Steps
Interakt comes with an **OpenAI** provider already set up (OpenAI-compatible, `https://api.openai.com/v1`).

1. Open its row's menu and click **Edit**.
2. Paste your **API key** and save. Interakt keeps it encrypted in the Secrets Vault as `ai_provider_openai`.
3. Click **Test Connection**: Interakt reads OpenAI's `/v1/models`.

For a second OpenAI account, click **Add Provider** and give it its own name (for example "OpenAI team"), with the same connection type and base URL.

### Models
By default, the OpenAI provider registers:
- `gpt-4o` — chat, most capable, more expensive.
- `gpt-4o-mini` — chat, fast and cheap.
- `gpt-4-turbo` — previous-gen chat.
- `text-embedding-3-small` — embedding, 1536 dimensions.
- `text-embedding-3-large` — embedding, 3072 dimensions.

Add others via **Manage Models** on the provider row.

An embedding model that can return shorter vectors on request (such as `qwen3-embedding` or `text-embedding-3-small`) has **Can shorten vectors** switched on. Interakt then asks it for the vector size the index expects, so it fits an index set up for fewer dimensions. New models of these families start with it on; for any other embedding model, switch it on only if the model supports it.

### Troubleshooting

| Error | Fix |
|---|---|
| HTTP 401 | Wrong key. Generate a new one in the OpenAI dashboard. |
| HTTP 429 | Rate-limited. Wait a minute and retry. |
| Validation passes but chat fails later | Billing not set up. Add a payment method in the OpenAI dashboard. |

## Ollama (local, free)

### What you need
- Ollama installed and running. Download from [ollama.com](https://ollama.com).
- The models you want, pulled. At minimum:
  ```
  ollama pull llama3              # chat
  ollama pull nomic-embed-text    # embeddings
  ```
- Run `ollama list` to confirm. Run `ollama serve` if it isn't already.

### Steps
1. Click **Add Provider**, name it, and set **Connection type** to **Ollama**.
2. Set **base URL** — `http://localhost:11434` by default. Change only if Ollama is on a different machine.
   If your Ollama sits behind a proxy that checks keys, set **Authentication** to **API Key** and enter the key: Interakt sends it as a bearer token.
3. Click **Discover Models** — Interakt asks Ollama for the pulled models, and takes each one's type, context size and (for embedding models) dimensions from Ollama.
4. Tick the ones you want to expose in the admin UI's dropdowns.
5. Click **Save**.

Interakt verifies it can reach the URL and that at least one model exists.

### Performance
Ollama on a laptop is slow. Each chat turn makes 3–5 LLM calls behind the scenes. A 7B model on a CPU-only machine can take 30+ seconds per response. For demos and dev work, run a small model (gemma2, mistral) and lower your expectations on speed. For production, use OpenAI.

### Troubleshooting

| Error | Fix |
|---|---|
| "Ollama unreachable" | `ollama serve` isn't running, or wrong URL. Run `ollama list` to wake it. |
| "No models found" | Pull at least one chat and one embedding model. |
| Works but very slow | Expected on CPU. Try a smaller model variant or switch to OpenAI. |

## An AI gateway or router (OpenAI-compatible)

Many organisations run their own AI gateway or router in front of their models. Any service with an OpenAI-style `/v1` API connects the same way, under any name you choose.

### What you need
- The service's address, up to and including `/v1` (for example `https://ai.example.edu/v1`).
- An API key for Interakt, if the service uses keys.

### Steps
1. Click **Add Provider** and give it a name, for example "Campus AI".
2. Set **Connection type** to **OpenAI-compatible**.
3. Paste the **base URL** and the **API key** (or set Authentication to **None**).
4. Save, then click **Test Connection**: Interakt reads the service's `/v1/models`.
5. Click **Discover Models** to add the models it offers, and set your defaults.

### Good to know
- A gateway may limit requests per key. Interakt waits for the time it asks (`Retry-After`) before trying again.
- Discover Models keeps the context window a service reports and, on a provider set as Local (self-hosted), reads each new embedding model's dimensions with one short embedding request. It says when an embedding model's dimensions need setting on the model.
- A model you switched off stays off when Discover Models runs again, and it names those models. One it hid because the service stopped listing it comes back on when listed again.
- On a provider set as Cloud, new models are added switched off: switch on the ones you want in **Manage Models**.

## Setting system defaults

Once you have one or more providers configured, set the system defaults in the **System Configuration** card (right column of the AI Providers screen):

- **Text generation default** — fallback for ad-hoc AI calls.
- **Embedding default** — used by new indexes. **Lock this in early** — switching later requires re-uploading every index's data.
- **Chat default** — used by new chat experiences.

Recommended for most teams:
- Embedding: OpenAI `text-embedding-3-small` (1536 dims, fast, cheap, reliable).
- Chat: OpenAI `gpt-4o-mini` for cost-sensitive, `gpt-4o` for quality.

## Testing a provider

Two ways:

- **Test Connection** in the provider's row actions — does a minimal ping.
- **Test → AI models** — actually run a generation, chat, or embedding against the provider.

If a provider feels broken, test in the Playground first. It exposes real responses with latency.

## Enabling and disabling

A disabled provider stays configured but can't be selected when creating new experiences. Existing experiences using it keep working — disable is forward-only.

## Where to go next

- [AI providers](../concepts/ai-providers) — concept page.
- [Secrets](../concepts/secrets) — where provider keys are kept; choose an existing secret instead of entering a key.
- [Create a search index](create-a-search-index) — uses the embedding default.
- [Create a chat experience](create-a-chat-experience) — uses the chat default.
