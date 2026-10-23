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
- Analytics: Popular and Failed Searches list only searches typed by visitors. Total searches, the failed-search rate, the trend chart and the experience comparison no longer count internal lookups such as loading filter values.
- Find Record returns an item only when its ID, SKU or name matches the request. Otherwise it returns `found: false` with no product card, which the test chat and tool analytics no longer show as a failure. New Find Record tools describe name lookups; existing tools keep their description until regenerated.

### Fixed

- The filter box on the Experiences, Indexes and Data Sources lists no longer loses focus after one keystroke.
- Searches made by an admin test chat against an external data source are no longer counted as live traffic.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
