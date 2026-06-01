---
sidebar_position: 12
---

# Elasticsearch tuning

This page covered low-level Elasticsearch field mapping internals — useful only for developers extending Interakt's index code.

For most users:

- [Index fields](../concepts/index-fields) covers the user-facing equivalents — searchable, facetable, sortable, autocomplete, boost.
- [Rebuilding an index](../concepts/rebuilding-an-index) covers when and how to push changes through.
- [Settings → Search](../concepts/settings) covers the global tuning knobs (timeout, RRF, weights).

If you really need the developer-level reference, see the source under `backend/src/app/search-indexes/` and the schema definitions under `backend/src/db/schema/`.
