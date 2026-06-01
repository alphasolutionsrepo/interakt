---
sidebar_position: 4
---

# Synonyms and stop words

Two text-analysis tools that quietly make search a lot better. Both live on the **Edit** screen of any search index, under the **Text Analysis** tab.

## Where to find them
Sidebar → **Capabilities → Search Indexes** → pick an index → **Edit** → **Text Analysis** tab.

## Synonyms — make search forgiving

A **synonym** tells the index that two or more terms mean the same thing. When a user searches for one, the index also finds documents containing the others. Without synonyms:

> Search for *"laptop"* finds documents with "laptop" but misses ones that say "notebook computer".

With a `laptop, notebook` synonym, both match either query.

### When you'd add a synonym

- **Industry jargon vs everyday words.** *"sneakers"* / *"trainers"* / *"running shoes"*.
- **Abbreviations and full names.** *"USA"* / *"United States"*.
- **Brand variants.** *"iPhone"* / *"i-Phone"* / *"Apple phone"*.
- **Misspellings you see in search analytics.** If a lot of people search *"adiddas"*, add it as a synonym for "adidas".
- **Internal vs external terminology.** Your support team calls it a "macro"; customers call it a "template".

### The two kinds of synonyms

Interakt supports two shapes — pick based on whether the relationship is symmetric.

#### Equivalent (comma-separated)

`laptop, notebook, ultrabook`

All three terms are treated as equivalent. A search for *any* of them finds documents containing *any* of them. Use this when the terms are genuinely interchangeable.

#### Mapping (arrow)

`usa => united states`

The left side is rewritten to the right side at search time. A search for *"usa"* finds documents with "united states", but a search for *"united states"* does **not** find documents with just "usa". Use this when you want a one-way normalisation — usually because your documents consistently use one form and you want to handle the others without polluting the index.

### Adding synonyms

1. Open the index → **Edit** → **Text Analysis** tab.
2. In the **Synonyms** card, type your synonym definition in the input.
3. Click **Add** (or press Enter).
4. The synonym shows as a badge. Click the **X** to remove.
5. Click **Save Changes** at the top.

A yellow banner appears warning you that **reindexing is required**. Synonyms are applied as documents are indexed, so existing documents don't pick up new synonyms until they're re-processed. Go to the index detail page and click **Reindex** — see [Rebuilding an index](rebuilding-an-index).

### Synonym gotchas

- **One direction vs both.** Use `=>` carefully. `iphone => apple phone` is usually *not* what you want — searches for "iphone" stop finding documents that just say "iphone". Prefer `iphone, apple phone` (comma).
- **Synonyms multiply combinations.** Every synonym you add increases index size and search work. Don't dump thesaurus.com in there — add the ones that matter from real search-log analysis.
- **Misspellings can be handled in two ways.** Synonyms work, but Interakt's default text analysis also does fuzzy matching for short edits. Add synonyms only for misspellings the fuzzy matcher can't catch.
- **Multi-word phrases work**, but be precise: `running shoes, jogging shoes` is two separate phrase synonyms. Surrounding multi-word terms with quotes isn't needed in the UI.

## Stop words — words to ignore

**Stop words** are words so common that matching them is meaningless. By default, every language has a list — *the, a, an, of, and, in, on…* in English. The index ignores these during indexing and during search.

That's why searching *"the running shoes"* and *"running shoes"* give the same results: "the" is a stop word.

Most of the time you leave the defaults alone. But sometimes you want to **add** to the list — and very occasionally, **remove** from it.

### When you'd customise stop words

- **Domain-specific filler.** A legal document corpus might want to ignore "whereas", "hereby", "thereof".
- **A repetitive brand name appearing in every record.** Filter the brand out so it doesn't drown out the actual differentiating terms.
- **Marketing fluff.** "premium", "exclusive", "limited edition" — if every product description has them, they're noise.

### Adding stop words

1. Open the index → **Edit** → **Text Analysis** tab.
2. In the **Custom Stop Words** card, type a word or comma-separated list ("whereas, hereby, thereof").
3. Click **Add**. Each word shows as a removable badge.
4. Click **Save Changes**.
5. Reindex — same as synonyms, the change applies as documents are indexed.

### When NOT to add stop words

- **Don't add searchable terms.** If you add "apple" to the stop list and you sell apples, your catalog becomes unsearchable. Stop words make sense only for words that genuinely don't differentiate.
- **Don't try to fix relevance with stop words.** If a common word is dominating results, it's usually a boost / search-field configuration problem, not a stop-word problem.

## Language

The **Language** dropdown on the same tab controls which built-in analyser the index uses. English gets English stop words, English stemming (so "running" → "run"), English-aware tokenisation. French gets French equivalents, and so on.

If your content is multilingual, you have a couple of options:

- **One index per language**, each set to its language. Highest quality, more management.
- **One index in a multilingual mode** if your search provider supports it (Elasticsearch's `cjk` analyser, Azure Cognitive Search's language detectors). Simpler, slightly lower quality.

Changing the language requires a [rebuild](rebuilding-an-index).

## How synonyms, stop words, and language work together

When a document is indexed:

1. Text is broken into tokens.
2. Stop words are dropped.
3. Each remaining token is stemmed using the language's rules.
4. Synonyms are expanded.
5. The result is what gets indexed.

When a user searches:

1. The query is broken into tokens.
2. Stop words are dropped.
3. Each remaining token is stemmed.
4. Synonyms are expanded (or rewritten, for `=>`).
5. The result is what gets matched against the index.

Because indexing and searching both go through the same pipeline, anything you change about the pipeline (language, stop words, synonyms) requires existing documents to be re-processed before the change is visible in results.

## Where to go next

- [Rebuilding an index](rebuilding-an-index) — the operation that applies these changes.
- [Index fields](index-fields) — text vs keyword type and how that interacts with text analysis.
- [Analytics](analytics) — search-log analysis is where you find which synonyms you actually need.
