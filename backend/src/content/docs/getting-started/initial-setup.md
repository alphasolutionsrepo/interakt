---
sidebar_position: 3
---

# Initial setup

The first time you log in, you have a working dashboard but no data, no AI provider, and no experiences. The **Initial Setup** screen (Platform → Initial Setup) walks you through both: configure an AI provider, then optionally build a fully working demo so you can see what Interakt does before you load your own data.

## Where to find it

Sidebar → **Platform → Initial Setup**.

The same screen is where you come back later to **tear the demo down** or **switch AI providers**.

## What this screen sets up

Two things, in this order:

1. **AI provider connection** — credentials, default chat model, default embedding model.
2. **(Optional) Fashion Catalog demo** — a fully working hybrid search index of 200 products, search tools, a public search experience, a public chat experience, and pre-populated analytics.

The demo is the fastest way to see every part of Interakt working at the same time. Run it, click around, then either keep building on it or reset and start clean with your own data.

## Step 1 — Choose an AI provider

Interakt supports several providers. The Initial Setup screen shows them as cards. Two are listed first because they're the recommended starting points.

### OpenAI (recommended for most setups)

- **Provider type:** cloud, paid.
- **What you need:** an API key from openai.com.
- **Default models:** `gpt-4o` for chat, `text-embedding-3-small` for embeddings.

In the OpenAI card:

- Paste your **API key**. If you've used Interakt before, the field shows *"Key is already saved — leave blank to keep"*.
- The **chat model** and **embedding model** fields are pre-filled with the recommended defaults. You can change them — anything OpenAI offers will work, but the defaults are the right balance of speed and quality for most use cases.

### Ollama (free, runs on your own machine)

- **Provider type:** local, free.
- **What you need:** Ollama installed and running locally (download from [ollama.com](https://ollama.com)).
- **Default models:** any chat model you've pulled (e.g. `llama3`, `mistral`), and `nomic-embed-text` for embeddings.

In the Ollama card:

- Paste the **base URL** (default `http://localhost:11434` — you only change it if Ollama is running somewhere else).
- Click **Re-check** — Interakt tries to reach Ollama and lists the models you've pulled.
- Pick a **chat model** and an **embedding model** from the dropdowns of pulled models.

Ollama needs to be **reachable from the Interakt server**, with the models you want already pulled (`ollama pull <model>`). If it's not reachable, the card shows instructions.

> **Tip — Ollama is slow on most laptops.** Each chat turn makes 3–5 LLM calls behind the scenes. A small machine running a big local model can take 30+ seconds per response. If the demo feels slow, switch to OpenAI.

### Other providers

Anthropic, Azure OpenAI, Google Vertex AI, HuggingFace are listed in the same screen with the same shape — paste the credential, pick a model. The setup screen only sets *one* provider as the system default; you can add others later under **Platform → AI Providers**.

## Step 2 — Decide whether to load the Fashion Catalog demo

The demo creates real, working resources in your installation:

| What it creates | Where to find it after |
|---|---|
| A hybrid search index of 200 fashion products | Capabilities → Search Indexes |
| Field mappings (title, brand, category, price, colour, size, etc.) | Inside that index → **Fields** |
| A file-store data source for the products | Capabilities → Data Sources |
| Four tools (search, inspect, enumerate, lookup) over that data source | Capabilities → Tools |
| A public **search experience** with display configuration | Experiences |
| A public **chat experience** that can answer "do you have red shoes under $100?" | Experiences |
| (Optional) Replayed search and chat traffic so Analytics isn't empty | Analytics |

Everything is **idempotent** — running it again with the same provider just re-checks. Running it with a *different* provider rebuilds the index from scratch because embedding models produce different vector sizes (1536 dims for OpenAI vs 768 for Ollama's nomic-embed-text), and an index is locked to the dims it was created with.

### "Include analytics warm-up"

Checkbox on the Initial Setup screen. If you tick it, the seeder replays a batch of representative searches and chat conversations against your new demo so the analytics dashboards aren't empty. Adds about a minute.

## Step 3 — Click "Set up demo"

The screen shows a live step-by-step progress stepper. Each step is one of:

1. **Provider** — connect and set defaults.
2. **Search index** — create a hybrid index.
3. **Fields** — discover the schema from the sample data, configure field roles.
4. **Documents** — load the 200 products.
5. **Tools** — generate search / inspect / enumerate / lookup tools.
6. **Search experience** — create the public search page.
7. **Chat experience** — create the public chat assistant.
8. **Warm-up** (if you ticked the box) — replay queries.

Long-running steps show a "takes longest" hint. The whole thing usually finishes in 2–5 minutes (faster with OpenAI, slower with local Ollama).

When it's done, the "Demo ready" card shows:

- The index name, document count, embedding model, and provider.
- Public URLs for the search and chat experiences (`/yourSearchSlug` and `/yourChatSlug`).
- Stats from the warm-up if you ran it.
- Quick links: **Search Playground**, **Your Experiences**, **Analytics Overview**, **Traces**.

## Re-running, reseeding, and resetting

The button label changes based on what's already there:

- **Set up demo** — first time, or after a Reset.
- **Re-run setup** — same provider as before, top up anything missing. Fast.
- **Force re-seed** — same provider, but rebuild from scratch (deletes and recreates the demo resources). Use this if you've messed with the demo and want a clean slate.
- **Reset** — destructive. Tears down everything the demo created (index, data sources, tools, experiences, replayed analytics). Your own data and experiences are untouched.

### Switching providers

If you've already seeded with OpenAI and you switch to Ollama (or vice versa), the screen shows a "Switch requires reset" alert. You have to **Reset first**, because:

- The search index has embeddings hard-baked from one model's vector size.
- A different model produces different-sized vectors.
- There's no way to "convert" — you rebuild.

The alert spells this out, and the only button it offers is **Reset**.

## The Help Assistant — built automatically

Independent of the demo, every time you boot Interakt with an AI provider configured, the platform also builds the **Help Assistant** — a chat experience trained on these docs. It uses the same pipeline as your own chat experiences, but its data is the documentation you're reading right now.

You access it via the **?** icon in the top-right of any admin page → **Ask** tab. Ask it "what does facetable mean" or "how do I add synonyms" and it grounds the answer in the docs.

The Help Assistant requires a system default embedding model of 1536 dimensions (OpenAI `text-embedding-3-small` or compatible). If your default is something else (e.g. Ollama's 768-dim model), the Help Assistant won't build until you switch the embedding default.

## Common gotchas

- **The "Reset" button doesn't ask twice.** It's destructive. Use it knowingly.
- **The chat experience created by the demo is public** — no API key needed to call it. Fine for a demo; revoke the access token or deactivate the experience before exposing the URL anywhere you don't want random visitors hitting it.
- **If a step fails partway**, the Result card shows the error and you can retry. The seeder picks up where it left off — nothing has to be torn down to retry.
- **Ollama on a small machine is genuinely too slow** for the demo's warm-up. Skip the warm-up checkbox, or switch to OpenAI for the demo and Ollama for testing later.

## What to do next

- [Your first experience](first-experience) — build a search/chat experience with your own data.
- [Search indexes](../concepts/search-indexes) — how to configure your own index.
- [AI providers](../concepts/ai-providers) — manage providers and system defaults after the first setup.
