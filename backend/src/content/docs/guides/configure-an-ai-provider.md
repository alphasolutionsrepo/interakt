---
sidebar_position: 6
---

# Configure an AI provider

You need at least one AI provider before you can create a semantic / hybrid index or any chat experience. This is the click-through. The concept page on [AI providers](../concepts/ai-providers) covers what each provider is good for.

The fastest path is the [Initial Setup wizard](../getting-started/initial-setup), which configures your first provider. This guide is for adding more providers afterwards, or for setting one up by hand.

## Where to go

Sidebar → **Administration → Platform → AI Providers**.

## OpenAI (cloud, paid — the recommended default)

### What you need
- An API key from [platform.openai.com](https://platform.openai.com). Dashboard → API keys → Create new. **Copy it now — you can't see it again.**
- Billing set up (the free tier doesn't include the chat models most experiences use).

### Steps
1. Click **Add Provider** → select **OpenAI**.
2. Paste your **API key**.
3. (Optional) Override the **display name** if you'll have multiple OpenAI accounts.
4. Leave **base URL** blank unless you're using a proxy.
5. Click **Save**. Interakt runs a connection test against OpenAI's `/v1/models` endpoint.
6. On success: provider is enabled, key is encrypted and stored.

### Models
By default, the OpenAI provider registers:
- `gpt-4o` — chat, most capable, more expensive.
- `gpt-4o-mini` — chat, fast and cheap.
- `gpt-4-turbo` — previous-gen chat.
- `text-embedding-3-small` — embedding, 1536 dimensions.
- `text-embedding-3-large` — embedding, 3072 dimensions.

Add others via **Manage Models** on the provider row.

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
1. Click **Add Provider** → select **Ollama**.
2. Set **base URL** — `http://localhost:11434` by default. Change only if Ollama is on a different machine.
3. Click **Discover Models** — Interakt asks Ollama for the list of pulled models.
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

## Anthropic, Azure OpenAI, Google Vertex AI, HuggingFace

Same shape — click **Add Provider**, select the type, fill the credentials, save.

- **Anthropic** — API key from [console.anthropic.com](https://console.anthropic.com). Chat models only, no embeddings.
- **Azure OpenAI** — API key, endpoint URL, deployment names.
- **Google Vertex AI** — project ID, credentials JSON.
- **HuggingFace** — API token.

Specific configuration is provider-dependent. The dialog adapts.

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
- **Playground → AI Services** — actually run a generation, chat, or embedding against the provider.

If a provider feels broken, test in the Playground first. It exposes real responses with latency.

## Enabling and disabling

A disabled provider stays configured but can't be selected when creating new experiences. Existing experiences using it keep working — disable is forward-only.

## Where to go next

- [AI providers](../concepts/ai-providers) — concept page.
- [Secrets](../concepts/secrets) — sometimes provider keys are stored there too.
- [Create a search index](create-a-search-index) — uses the embedding default.
- [Create a chat experience](create-a-chat-experience) — uses the chat default.
