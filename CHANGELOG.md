# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `TRUSTED_PROXY_HOPS` setting: the number of proxies in front of Interakt that add to `X-Forwarded-For` (default 1).

### Changed

- AI experiences enforce their allowed origins, chats per minute (default 60) and requests per day (default 10,000 chat messages per experience). Settings saved on existing AI experiences take effect on upgrade.
- Per-client rate limits identify a client by the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` places from the end.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
