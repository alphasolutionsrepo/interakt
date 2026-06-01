---
sidebar_position: 18
---

# Settings

The **Settings** section is for global behaviour — things that apply across every experience, index, and tool. There are three sub-screens: AI Providers, Search Settings, and Cache Management.

## Where to find these screens
Sidebar → **Administration → Settings**.

[AI Providers](ai-providers) has its own page. This page covers **Search Settings** and **Cache Management**.

## Search Settings

Tunes the global behaviour of search across every index and every search experience. Most people leave the defaults alone — these knobs are for when you've benchmarked your search quality and have specific tuning to do.

### Where to find it
Sidebar → **Administration → Settings → Search Settings**.

### Layout

Two cards.

### Search Timeout card

Just one setting:

- **Search timeout (ms)** — slider from 1,000 to 120,000 (1s to 2 minutes), default usually around 30,000 (30 seconds).

Long-running queries get killed at this threshold. Increase if you're seeing legitimate searches over big indexes time out; decrease if you want to fail fast and force the consumer to retry.

This is a hard cap. Even if a search experience asks for more, this overrides.

### Hybrid Search card

Four settings, all affecting how lexical and semantic searches are combined in hybrid mode.

- **RRF rank constant (k)** — slider 1–200, default 60.
  - This is the `k` in `score = 1 / (k + rank)`. Higher values reduce the impact of top-ranked documents.
  - The default 60 is the standard from the RRF paper. You almost never change it.

- **Window size** — slider 10–500, default 100.
  - How many top results from each side (lexical and semantic) are considered for merging.
  - Bigger = more comprehensive merging, slower.
  - Smaller = faster, may miss good results that appear in only one search's top window.

- **Lexical weight** — slider 0.1–3.0, default usually 1.0.
  - How much keyword matches contribute to the final ranking.
  - Higher = favour exact keyword matches.

- **Semantic weight** — slider 0.1–3.0, default usually 1.0.
  - How much vector / meaning matches contribute to the final ranking.
  - Higher = favour conceptual similarity.

The two weights are relative — what matters is the ratio. Lexical 2.0 + Semantic 1.0 means keyword matches count twice as much as semantic ones.

### When to tune these

- **Lexical-heavy data** (technical specs, model numbers, code) → bias toward lexical.
- **Conceptual data** (articles, descriptions, FAQs) → bias toward semantic.
- **Mixed data** → leave 1.0 / 1.0.

The safest tuning method: run a batch of representative queries before and after a change in the Playground, compare results, see if the right things come up first. Don't tune blind.

### Actions

- **Save Changes** — only enabled when you've changed something.
- **Discard Changes** — revert to last saved.
- **Refresh** — reload from the database.

Changes apply immediately to **new searches**; no rebuild needed.

## Cache Management

The **Cache Management** screen shows what Interakt has cached in memory, lets you clear caches, and explains what each cache does.

### Where to find it
Sidebar → **Administration → Settings → Cache Management**.

### What this screen does

Interakt caches a number of things in-memory for performance — provider configurations, data-source metadata, search-index schemas, tool definitions, search-experience configurations, analytics aggregates. The cache reduces database hits and keeps the admin UI snappy.

Each cache has:
- A **TTL** (time-to-live) — how long entries stay before they're refetched.
- A **max size** — how many entries it holds before evicting old ones.

You don't normally touch these. The Cache screen exists for the rare case where you've changed something at the database level (or rolled back a migration) and you want to force Interakt to forget what it has cached.

### Layout

Stats grid at the top (4 cards):
- **Total Entries** — across all caches.
- **Total Max Size** — sum of all the per-cache limits.
- **Pending Operations** — async cache operations in flight.
- **Features Count** — number of distinct caches.

### Cache instances grid

A card per cached feature — AI Providers, Data Sources, Search Indexes, Tools, Search Experiences, Analytics, etc. Each card shows:

- Current entries.
- Max size.
- TTL.
- A **Clear** button.

### Global actions

- **Clear All Caches** — destructive but safe. Forces Interakt to re-fetch everything from the database. Briefly slower next request; no data loss.
- **Refresh** — reloads the stats display (doesn't clear anything).

### When to clear caches

- After a manual database change (rare).
- After upgrading or rolling back Interakt.
- When you've changed something in the UI and the change isn't reflecting (very rare — caches usually invalidate themselves).
- Debugging "why is this still showing the old value?" — clear, retry.

Clearing caches doesn't affect search results, indexed documents, or user data. It only invalidates *Interakt's internal lookup tables*.

## Common gotchas (across both screens)

- **Changing global hybrid weights breaks experiences with specific tuning.** If you've tuned per-experience weights, they're overridden by these globals. Keep your changes here conservative.
- **Cache clearing isn't a fix.** If your data really is stale, clearing the cache is a workaround — figure out *why* it was stale (a sync that didn't run, a migration that didn't complete).
- **Settings changes don't trigger rebuilds.** Search Settings are query-time — they affect the next query, not stored data. To affect stored data you reindex (see [Rebuilding an index](rebuilding-an-index)).

## Where to go next

- [AI Providers](ai-providers) — the third settings sub-screen.
- [Search experiences](search-experiences) — per-experience overrides for some of the global settings.
- [Rebuilding an index](rebuilding-an-index) — changes that *do* require a rebuild (not these).
