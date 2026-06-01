---
sidebar_position: 3
---

# Index fields

Each field in your data has a set of switches that decide how it behaves in search. A `name` field is searchable and shown in results. A `category` field is searchable *and* filterable (so users can narrow by it). A `price` field is filterable and sortable. A `thumbnail_url` field is returned in results but never searched.

This page covers what every switch on the **Fields** screen does and when you'd use it.

## Where to find this screen
Sidebar → **Capabilities → Search Indexes** → pick an index → **Configure Mappings** (or click **Fields** in the index detail header).

## What the screen does

Two-column layout:

- **Left** — the list of fields in your index, with their current settings.
- **Right** — a **Source Data** panel where you can paste sample JSON. Interakt detects what fields exist in your data and proposes a mapping.

When you change anything on this screen, a floating bar appears at the bottom with **Discard** and **Save Mappings** buttons. Nothing is saved until you click Save.

If your changes affect how documents are indexed (e.g. you turned a field facetable), the bar tells you "Changes require reindexing after save" — see [Rebuilding an index](rebuilding-an-index).

## The two ways to use the screen

### Visual mode (default)
A table of fields with editable cells. Good for everyday work.

### JSON mode
Click the **JSON** toggle in the header. The whole field mapping shows as a single JSON document — useful for power users who want to copy/paste a mapping between environments, version-control it, or make a big set of changes at once. **Apply** validates and applies the JSON.

## How fields get there in the first place

When you paste sample data into the Source Data panel, Interakt:

1. Scans the records and finds every field name.
2. Guesses each field's **type** from the values (numbers stay numbers, true/false becomes boolean, plain strings become text or keyword based on length and content).
3. Opens a "Review inferred fields" dialog where you can confirm types and pick which to create.

You can also click **Add field** in the table header to add fields manually.

## The columns in the table

| Column | What it shows |
|---|---|
| **Field name** | The display name + the technical name (used in queries) + the type badge. Required fields are marked. |
| **Source field** | Which field in your source data this maps to. Editable as a dropdown when sample data is loaded. |
| **Mapping mode** | How the value gets in (from source, static, generated, computed — see below). |
| **Attributes** | Icons showing what's enabled — searchable, facetable, autocomplete, vector source. |
| **Actions** | A gear icon that opens the full configuration sidebar for the field. |

## The field config sidebar (click the gear)

This is where every switch lives. Three sections:

### Section 1 — Value & source

How the value for this field gets populated when a document is indexed. The **mapping mode** dropdown controls everything else here.

| Mode | What it does | When to use it |
|---|---|---|
| **Source** | Take the value from a named field in the incoming document. | Default for almost everything. |
| **Static** | Always the same value for every document. | `currency: "USD"`, `region: "EU"` — fields you want to filter on but don't want in every source record. |
| **Default with fallback** | Source field if present; fallback value if missing. | Optional fields like `availability: true` defaulted on. |
| **Generated** | Auto-generated. Sub-types: UUID, timestamp, sequence, hash of other fields. | When your source data doesn't have a unique ID — generate one. |
| **Computed** | Extracts a value from a nested array or object. You name a path, an extraction field, and an aggregation (min, max, sum, avg, first, last, unique, flatten…). | "Lowest price across variants" → path `variants[]`, extract `price`, aggregation `min`. Useful for catalogs with nested structure. |
| **Collect** | Gather a list of source fields into one. | When extra source fields are interesting but not worth separate columns. |
| **Reference** | Copy the source from another already-mapped field. | `unique_id` = same source as `product_id`. |
| **None** | Field exists but isn't populated. | Placeholder. |

Most fields will be **Source** mode with a value transform or two. The advanced modes are for when the shape of your source data and the shape you want in the index don't match.

#### Value transforms
Optional steps applied to the source value before indexing — **uppercase**, **lowercase**, **trim**, **split**, **join**, **replace**, **substring**, **custom**. Useful when your data is messy ("CATEGORY: Shoes" → trim and lowercase to `shoes`).

### Section 2 — Search behaviour

These are the switches that decide how the field behaves in search.

#### Searchable
Does keyword search look at this field's content?

- **On** for things like `title`, `description`, `brand`, `body` — anything users would type words from.
- **Off** for things like internal IDs, image URLs, prices.

Searchable fields are run through the index's text analysis (stemming, stop words, lowercasing) so a search for *"running shoes"* matches *"runner shoe"*.

**Changing this requires a [rebuild](rebuilding-an-index).**

#### Facetable
Can your users filter results by this field's values?

- **On** for things like `category`, `brand`, `colour`, `size`, `status` — short, repeating values you'd want a filter chip for.
- **Off** for unique values like titles, descriptions, IDs.

When a field is facetable, search responses include a count of how many results have each value (the "facets" you see as filter chips in real search UIs: *Brands: Nike (24) / Adidas (18) / Puma (5)*).

Facetable fields can also have **filter value mappings** configured — see [Filter value mappings](#filter-value-mappings) below.

**Changing this requires a [rebuild](rebuilding-an-index).**

#### Sortable
Can results be ordered by this field?

- **On** for things like `price`, `date_created`, `rating`, `popularity` — anything users would want to sort by.
- **Off** for free text fields (text is sortable but rarely useful — "alphabetical by description" isn't a real use case).

#### Autocomplete *(text fields only)*
Should this field power the "show suggestions as the user types" feature?

- **On** for `title`, `name`, `keywords` — the fields where prefix-matching makes sense.
- **Off** for anything long-form (`description`, `body`).

Autocomplete uses a special analyser (edge-ngrams) which makes the index bigger but makes prefix matches near-instant.

**Changing this requires a [rebuild](rebuilding-an-index).**

#### Include in response
Is the field's value returned in search results?

- **On** for everything you want to display.
- **Off** for internal-only fields (computed scores, raw embedding inputs, debug metadata).

Default is on.

#### Boost value
A relevance multiplier. Default is 1. Set higher to make matches in this field count more in ranking.

- `title` often gets boost 2 (matching the title is a strong signal).
- `description` left at 1.
- `tags` sometimes boosted to 1.5.

Don't overuse it — boosting everything is the same as boosting nothing. Pick the 1–2 fields that genuinely matter most.

### Section 3 — Filter value mappings *(only for facetable fields)*

Real data has the same thing spelled multiple ways: "red", "crimson", "scarlet", "RED". When you filter by `colour: red`, you usually want all of them.

The **Filter value mappings** modal lets you set up a **canonical value** → **aliases** map. *"red"* gets normalised to the same bucket as "crimson" and "scarlet"; the facet count adds them up; the filter chip says "red (12)" instead of three separate chips.

Open it via **Edit Filter Mappings** in the sidebar.

This applies on the way in (when documents are indexed) and on the way out (when users filter). Changing it requires a [rebuild](rebuilding-an-index) so existing documents pick up the new mapping.

## Field types

The type controls what kinds of operations work on the field. Set it once at field creation; changing later requires a rebuild and might break things downstream.

| Type | What it's for |
|---|---|
| **text** | Free-form text. Tokenised, stemmed, fuzzy-matchable. Use for titles, descriptions, body text. |
| **keyword** | Exact-match strings. Not tokenised — searching `"shoes"` only matches the literal value "shoes". Use for categories, statuses, SKUs, anything you'll facet by. |
| **number** | Integers or decimals. Filterable, sortable, range-queryable. |
| **boolean** | True/false. Filterable. |
| **date** | Dates and timestamps. Filterable, sortable, range-queryable. |
| **geo_point** | Latitude/longitude. For "find near me" queries. |
| **object** / **nested** | Structured sub-records. Used internally by *computed* mappings. |

## Auto-mapping vs manual mapping

When you paste source data, Interakt auto-detects fields and proposes types. This works for ~80% of cases. The 20% you'll edit by hand:

- **Numbers that should be keywords** — SKUs, model numbers, postal codes. Looks like a number, behaves like an ID.
- **Strings that should be dates** — only if your dates are in a non-standard format.
- **Fields derived from nested data** — auto-detection only sees top-level fields. A `lowest_price` field computed from a `variants[]` array has to be added manually with the **Computed** mapping mode.
- **Static fields** — `currency: "USD"` that isn't in your source data has to be added manually with the **Static** mapping mode.

## Import / Export

The **Import** and **Export** buttons in the header dump or load the entire field mapping as JSON. Useful for:

- Copying a mapping between environments (dev → staging → prod).
- Bulk-editing in a text editor instead of clicking through the UI.
- Backing up your config to a version-control system.

The exported JSON is also what you see in **JSON mode**.

## What changes require a rebuild?

These changes need a [reindex](rebuilding-an-index) for existing documents to pick them up:

- Adding, removing, or renaming a searchable / facetable / autocomplete field.
- Changing a field's **type**.
- Toggling **searchable**, **facetable**, or **autocomplete**.
- Editing **filter value mappings**.
- Adding / removing **synonyms** or **stop words**.
- Changing the **language**.

These do **not** require a rebuild:

- Changing the **display name** of a field.
- Changing the **boost value**.
- Changing **include in response**.
- Changing **value transforms** that don't change indexed content (only affects newly uploaded docs).

The screen tells you which kind of change you've made — if a rebuild is needed, the "Reindex needed" badge appears next to the save bar.

## Common gotchas

- **Forgetting to mark a field facetable.** If you can't filter by it after upload, that's almost always why. Toggle facetable on, save, rebuild.
- **Boosting too many fields.** Boost is relative — boosting everything to 2 is the same as boosting nothing.
- **Computing fields users don't see.** A computed `lowest_price` is great for sorting and filtering, but if it's not in the display configuration of your search experience, your users never see it.
- **Treating text and keyword the same.** A `category` field with type `text` will tokenise the value — searching for `shoes` finds documents tagged "shoes-clearance" because both share the token `shoes`. That's usually not what you want for categories. Use `keyword`.

## Where to go next

- [Synonyms and stop words](synonyms-and-stop-words) — make search forgiving.
- [Rebuilding an index](rebuilding-an-index) — when to push the button.
- [Display configuration](display-configuration) — what your *users* actually see in result cards.
- [Loading data](../guides/bulk-load-data) — getting documents in.
