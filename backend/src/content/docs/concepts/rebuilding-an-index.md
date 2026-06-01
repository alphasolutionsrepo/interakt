---
sidebar_position: 5
---

# Rebuilding an index

Sometimes you change something and existing documents need to be reprocessed for the change to apply. This is "rebuilding" or "reindexing." It's a single button click — the screen tells you when you need to use it.

## When you need to rebuild

A rebuild reprocesses every document in the index against your current field config and text-analysis settings. You need it when any of these have changed since the documents were uploaded:

| What changed | Why it needs a rebuild |
|---|---|
| **Language** | The text analyser used to tokenise documents at index time is set by the language. If you change it, existing tokens are stale. |
| **Synonyms** | Synonyms are baked in during indexing. New synonyms only apply to new uploads until you rebuild. |
| **Stop words** | Same — applied during indexing. |
| **A field's type** (text → keyword, number → keyword, etc.) | The way the value is stored physically changes. |
| **Searchable** toggled on a field | Searchable fields are tokenised on the way in; non-searchable ones aren't. |
| **Facetable** toggled on a field | Facetable fields are stored as exact tokens for filtering and aggregation. |
| **Autocomplete** toggled on a field | Autocomplete uses a special analyser that needs to be applied at index time. |
| **Filter value mappings** changed | The canonical-value normalisation happens at index time. |
| **Field renamed** | The new name doesn't exist in existing documents until they're reprocessed. |

Things that do **not** need a rebuild:

- **Boost values** — used at search time, not index time. New boosts apply immediately.
- **Display name** of a field — purely cosmetic.
- **Include in response** — applies at query time.
- **Description** of the index.
- **Number of replicas** (Elasticsearch).
- **Indexing strategy** (changing how *future* uploads are batched).

## How the UI tells you a rebuild is needed

Two visual cues:

- **On the Edit screen**, changing language / synonyms / stop words shows an amber banner: *"Reindexing required. These changes will require a full reindex of all documents to take effect."*
- **On the Fields screen**, changing field attributes that affect indexing shows a **"Reindex needed"** badge at the top, and the save bar at the bottom says *"Changes require reindexing after save."*

Saving doesn't trigger the rebuild — you save first, then click **Reindex** when you're ready.

## How to rebuild

### From the index detail page
1. Open the index.
2. Look at the **Index Name** card on the right.
3. Click **Reindex**.
4. A dialog asks to confirm and shows the current document count.
5. Click **Reindex**.
6. The status badge changes to **Indexing** and a progress bar shows.
7. When done, the badge goes back to **Ready** and the success dialog shows stats (documents processed, duration).

### From the Fields screen
After changes that require a rebuild, the floating save bar has a **Reindex Now** button. Same flow.

## What happens during a rebuild

- Every document is re-read from internal storage.
- Run through the current text-analysis pipeline (language, stop words, synonyms).
- Re-mapped through your current field mappings.
- Written back to the search index.

For Semantic / Hybrid indexes, the embeddings are *not* regenerated — only the lexical side is reprocessed. This is fast.

**To regenerate embeddings** (e.g. because you changed which fields feed into the embedding), you need to **re-upload the documents**. The rebuild button doesn't do this — see [Loading data](../guides/bulk-load-data).

## How long does it take

| Index size | Typical rebuild time |
|---|---|
| Up to 1,000 documents | Seconds. |
| 1,000 – 50,000 documents | Tens of seconds to a couple of minutes. |
| 50,000 – 1,000,000 documents | Minutes to ~half an hour. |
| Larger | Plan a window — run during low-traffic time. |

A rebuild is non-blocking — search keeps working against the existing index while the rebuild runs. When it completes, the new tokens take over.

## When something goes wrong

If a rebuild fails, the index status goes to **Error** and a recovery banner appears on the detail page with a **Recreate Index** button.

**Recreate Index** is the heavy-hammer fallback. It:

1. Drops the underlying index structure in the search provider.
2. Rebuilds the empty structure from your saved field definitions.
3. Leaves you with an empty index — you re-upload your documents.

This is *destructive of indexed data* but not of configuration. Your field mappings, synonyms, language, AI config, and so on all survive. Use it when:

- The search provider got into a bad state ("shards corrupted", "mapping conflict") that a reindex can't fix.
- You changed something that's only allowed on a fresh index (rare).

## Switching the AI provider or embedding model

This is a **different and more destructive** operation, not the same as a reindex.

The Edit screen → AI Config tab has a **Change Configuration** button. Clicking it warns you:

> Switching to a different provider or model will delete all indexed documents and require you to re-upload your data to generate new embeddings.

This is because different embedding models produce different-sized vectors and Interakt's vector storage is hardcoded to one size per index. There's no in-place migration — you reset, re-upload, and the new model embeds everything from scratch.

If you really need to migrate to a different embedding model, the safest path is:

1. Create a new index with the new model.
2. Upload your data to it.
3. Test the new index alongside the old one in the [Playground](playground).
4. Once you're happy, point your search experience at the new index (and deactivate the old one).

This is also the right pattern for any change that needs a rebuild but you want zero downtime — build the new one parallel, switch, retire the old one.

## Rebuild vs re-upload — which one do I need?

| You changed… | You need… |
|---|---|
| Synonyms, stop words, language | **Reindex** |
| Field attributes (searchable, facetable, autocomplete) | **Reindex** |
| Field types | **Reindex** |
| Filter value mappings | **Reindex** |
| The AI provider or embedding model | **Reset + re-upload** (via Change Configuration) |
| Which fields feed into the embedding | **Re-upload** |
| Boost values | Nothing — applies on next query |
| Display configuration in the search experience | Nothing — applies on next query |
| Display name / description / "include in response" | Nothing — applies on next query |

## Common gotchas

- **Forgetting to click Reindex.** You save the change, the UI says "saved", and you wonder why searches still behave the old way. Look for the "Reindex needed" badge.
- **Rebuilding doesn't regenerate embeddings.** If the change is about which fields embed (or which model), you have to re-upload.
- **The status badge says Indexing for a while.** That's fine — the rebuild is running. Search keeps working in the meantime.
- **Recreating an index loses your data.** Use only when reindex can't fix the problem.

## Where to go next

- [Index fields](index-fields) — what's behind the toggles that need a rebuild.
- [Synonyms and stop words](synonyms-and-stop-words) — the most common reason to rebuild.
- [Loading data](../guides/bulk-load-data) — what to do after Recreate Index.
