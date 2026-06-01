---
sidebar_position: 3
---

# Configure synonyms

Adding synonyms to an index is a small change with a big quality impact. This guide is the click-through. The concept page on [Synonyms and stop words](../concepts/synonyms-and-stop-words) explains the what and why.

## Before you start

- You have an index with some data loaded.
- You know which terms your users use that don't appear in your data.

If you don't know which synonyms you need, check **Analytics → Overview → Trending queries** for searches that returned no results — those are the gaps.

## 1. Open the text analysis tab

Sidebar → **Capabilities → Search Indexes** → pick your index → **Edit** → **Text Analysis** tab.

## 2. Add a synonym

In the **Synonyms** card:

1. Type the synonym in the input field.
2. Click **Add** (or press Enter).
3. The synonym shows as a removable badge.

### The two shapes

**Equivalent (comma-separated):**

```
laptop, notebook, ultrabook
```

All three are interchangeable. Use this for genuine synonyms.

**Mapping (arrow):**

```
usa => united states
```

The left side is rewritten to the right at search time, but not the other way. Use for one-way normalisation.

### Examples to start with

| Synonym | Why |
|---|---|
| `laptop, notebook` | Industry jargon vs everyday word. |
| `sneakers, trainers, running shoes` | UK vs US vs descriptive. |
| `adiddas => adidas` | Common misspelling. |
| `iphone, apple phone` | Brand variants. |
| `template => macro` | Internal vs external terminology. |

## 3. (Optional) Add stop words

Same screen, **Custom Stop Words** card. Words you want ignored during indexing and searching, on top of the default list for your language.

Usage:

- Comma-separated input ("whereas, hereby, thereof").
- Click Add. Each becomes a removable badge.

See [Synonyms and stop words → Stop words](../concepts/synonyms-and-stop-words) for guidance — adding the wrong stop word makes your data unsearchable.

## 4. Save

Click **Save Changes** at the top.

An amber banner appears:

> Reindexing required. These changes will require a full reindex of all documents to take effect.

You've saved the configuration, but existing documents haven't been re-processed. The new synonyms apply only to new uploads until you rebuild.

## 5. Rebuild the index

Go back to the index detail page. Find the **Index Name** card on the right. Click **Reindex**.

A confirmation dialog shows the current document count. Click **Reindex**.

The status badge changes to "Indexing" and a progress bar shows. Once it's done, the badge goes back to "Ready" and the new synonyms are live.

How long it takes:
- 1,000 documents: seconds.
- 50,000 documents: a couple of minutes.
- 500,000+: plan a window.

Search keeps working against the existing index while the rebuild runs.

## 6. Verify

Sidebar → **Playground → Index Search**. Pick your index. Search for a synonym you added:

- If you added `laptop, notebook`, search for *"laptop"* and confirm "notebook" records appear in the results.
- Search for *"notebook"* and confirm "laptop" records also appear.

If they don't, the rebuild didn't finish or didn't apply. Check the index status and re-trigger the rebuild.

## Common gotchas

- **Forgetting to rebuild.** The save just stored the synonym list — it doesn't change indexed documents. Click Reindex.
- **One-way arrows where you wanted both ways.** `iphone => apple phone` makes searches for "iphone" find "apple phone", but searches for "apple phone" *don't* find "iphone". Use the comma form unless you specifically want one-way.
- **Adding too many synonyms.** Every synonym increases index size and search work. Stick to what you actually see in search-analytics gaps.
- **Synonyms multi-word.** They work. `running shoes, jogging shoes` is two separate phrases — Interakt handles the multi-word matching.

## Where to go next

- [Synonyms and stop words](../concepts/synonyms-and-stop-words) — full concept page.
- [Rebuilding an index](../concepts/rebuilding-an-index) — what else needs a rebuild.
- [Analytics](../concepts/analytics) — find which synonyms to add next.
