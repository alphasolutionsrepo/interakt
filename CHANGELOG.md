# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `TRUSTED_PROXY_HOPS` setting: the number of proxies in front of Interakt that add to `X-Forwarded-For` (default 1).
- Analytics → Overview: an Assistant Searches card listing what AI assistants searched for while answering visitors, and how often each query found nothing.

### Changed

- AI experiences enforce their allowed origins, chats per minute (default 60) and requests per day (default 10,000 chat messages per experience). Settings saved on existing AI experiences take effect on upgrade.
- Per-client rate limits identify a client by the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` places from the end.
- Find Record returns an item only when its ID, SKU or name matches the request. When several items fit, it returns `found: false` with `matches` so the answer can ask which one; when none fits, `found: false` with up to three `closestMatches`. Neither shows a product card, and the test chat and tool analytics no longer show them as failures. On a managed index with keyword or hybrid search, a SKU or name that is searchable but kept out of responses still identifies its item, and only the fields responses show are returned. Find Record tools on a search index describe name lookups; existing tools still on the generated description are updated, and descriptions an admin wrote are kept. Experience instructions the create wizard wrote now say "look up specific items" instead of "look up specific items by ID" where the experience has Find Record on a search index.
- Index search requests (`/api/search/index/:id`, `/api/search/name/:name`) accept `includeHiddenSearchedFields`: each hit then also carries the searched fields kept out of responses, in `hiddenSearchedFields`, apart from `source`.
- Analytics: Popular and Failed Searches list only searches typed by visitors. Total searches, the failed-search rate, the trend chart and a search experience's row in the experience comparison no longer count internal lookups such as loading filter values.

### Fixed

- The filter box on the AI Experiences, Search Experiences, Search Indexes, Data Sources, Tools and MCP Connections lists no longer loses focus while the list reloads.
- Find Record on an Azure AI Search index goes on to search by name when the id isn't a document key, as on Elasticsearch.
- Find Record on an external Elasticsearch source also finds a record by the id its search results and lists of matches give (Elasticsearch's own document id).
- Searches made from an admin test chat, the playground or a tool's Test panel are no longer counted as live traffic.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
