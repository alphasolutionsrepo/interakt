# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `TRUSTED_PROXY_HOPS` setting: the number of proxies in front of Interakt that add to `X-Forwarded-For` (default 1).

### Changed

- AI experiences enforce their allowed origins, chats per minute (default 60) and requests per day (default 10,000 chat messages per experience). Settings saved on existing AI experiences take effect on upgrade.
- Per-client rate limits identify a client by the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` places from the end.
- Find Record returns an item only when its ID, SKU or name matches the request. When several items fit, it returns `found: false` with `matches` so the answer can ask which one; when none fits, `found: false` with up to three `closestMatches`. Neither shows a product card, and the test chat and tool analytics no longer show them as failures. A SKU or name that is searchable but kept out of responses still identifies its item, and only the fields responses show are returned. Find Record tools on a search index describe name lookups; existing tools still on the generated description are updated, and descriptions an admin wrote are kept.
- Search requests accept `includeHiddenSearchedFields`: each hit then also carries the searched fields kept out of responses, in `hiddenSearchedFields`, apart from `source`.

### Fixed

- The filter box on the AI Experiences, Search Experiences, Search Indexes, Data Sources and Tools lists no longer loses focus while the list reloads.
- Fetching a document that doesn't exist from an Azure AI Search index answers "not found", as on Elasticsearch, instead of an error.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
