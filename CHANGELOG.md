# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `TRUSTED_PROXY_HOPS` setting: the number of proxies in front of Interakt that add to `X-Forwarded-For` (default 1).
- Find Record tools on a search index have name fields and code fields, set on the tool's Edit page and filled in by Create Tools. Find Record matches only on the chosen fields; a list left empty is worked out from field names, as before. A Find Record tool without any field can't be added to an AI experience until it has one; experiences that already use it keep working. Deleting an index field a Find Record tool uses is blocked, and a chosen field that leaves an external index, or that the latest sample of a sampled index didn't show, is flagged on the tool's page.
- `GET /api/tools/:id/lookup-fields`: a Find Record tool's fields against its data source (what it can choose from, missing fields, warnings, a suggestion).
- Analytics → Search: an Assistant Searches card listing what AI assistants searched for while answering visitors, and how often each query found nothing.
- Analytics is one area with sections (Overview, Search, Conversations, AI & cost, Traces, Settings), a shared experience and period filter, and an Ask chat on every section. The Overview shows what needs attention beside the chat, with the experiences table below; a finding can be hidden for 7 days.
- Analytics period picker with presets and custom dates, kept in the URL. Figures are grouped by day in the viewer's time zone, and headline figures show the change from the same days just before.
- Analytics charts have a table view, and Search activity can be clicked or dragged to look at a day or a range, or to ask about it. Traces opens a single trace from `?trace=<id>`.
- Ask chat: questions carry the page's period, time zone and section, and named dates are read in the viewer's time zone. New tools compare periods, compare experiences, list failed conversations and report AI cost and usage. Figures in an answer that aren't in its data are flagged. Chat history can be searched. Stop ends the answer on the server, and nothing is saved.
- Home dashboard built from one cached request (`GET /api/dashboard/home`): last-7-days figures with the change on the week before, an Ask box, what needs you, notable changes, findings and tips, the busiest experiences, recent changes, and a first-run checklist. Dismissed tips stay dismissed for every admin.
- "Health check" background job: checks the database, search engine and AI providers every 10 minutes (`HEALTH_CHECK_CRON`; `off` before the first start skips it). The home dashboard shows the latest result.
- "Refresh AI insights" runs nightly at 02:00 UTC from the first start (`INSIGHTS_REFRESH_CRON`; `off` before the first start keeps insights on demand; `INSIGHTS_REFRESH_TIMEZONE`). A schedule changed or removed in the UI stays that way. Each run calls the AI model for every experience with recent activity, so with a hosted model it has a cost.
- Light, dark and system theme toggle in the top bar.
- Connection pool sizes per pool: `DB_POOL_MAX`, `ANALYTICS_DB_POOL_MAX`, `JOBS_DB_POOL_MAX`.
- Analytics migration `0013` adds `analytics_hidden_findings` (`npm run db:migrate-analytics`). A database that already has the table keeps it.

### Changed

- AI experiences enforce their allowed origins, chats per minute (default 60) and requests per day (default 10,000 chat messages per experience). Settings saved on existing AI experiences take effect on upgrade.
- Per-client rate limits identify a client by the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` places from the end.
- Find Record returns an item only when its ID, SKU or name matches the request. When several items fit, it returns `found: false` with `matches` so the answer can ask which one; when none fits, `found: false` with up to three `closestMatches`. Neither shows a product card, and the test chat and tool analytics no longer show them as failures. On a managed index with keyword or hybrid search, a SKU or name that is searchable but kept out of responses still identifies its item, and only the fields responses show are returned. Find Record tools on a search index describe name lookups; existing tools still on the generated description are updated, and descriptions an admin wrote are kept. Experience instructions the create wizard wrote now say "look up specific items" instead of "look up specific items by ID" where the experience has Find Record on a search index.
- Index search requests (`/api/search/index/:id`, `/api/search/name/:name`) accept `includeHiddenSearchedFields`: each hit then also carries the searched fields kept out of responses, in `hiddenSearchedFields`, apart from `source`.
- Analytics: Popular and Failed Searches list only searches typed by visitors. Total searches, the failed-search rate, the trend chart and a search experience's row in the experience comparison count only visitor searches and the AI's Search tool searches, not the lookups that Find Record, List Values and query understanding run. Searches an AI experience made before its searches were stored are counted from its Search tool calls only.
- Analytics: every search records what started it (a visitor, an AI tool or an AI step) and which tool or step ran it; the recent searches feed shows them by name. Searches stored before as internal lookups are relabelled.
- Analytics: Search tool searches on a file store are recorded like those on any other source.
- Analytics: a search that failed is recorded as failed, not as one that found nothing, so it no longer appears in Failed Searches; the failed-search rate is worked out over the searches that ran.
- Analytics: average results in Popular Searches and the quality score count only searches that ran, not failed ones.
- Analytics: each AI usage record keeps what the call was for (indexing, search, chat steps, memory, the topic guardrail and so on).
- The sidebar is grouped into Dashboard, Monitor, Experiences, Build, Test and Admin, with Documentation in the footer, and lists the analytics sections under Analytics.
- Background job queue options (expiry, retries, retention) apply when queues are created or updated. Idle analytics database connections close, and dev hot reloads reuse their pools.

### Fixed

- The filter box on the AI Experiences, Search Experiences, Search Indexes, Data Sources, Tools and MCP Connections lists no longer loses focus while the list reloads.
- Find Record on an Azure AI Search index goes on to search by name when the id isn't a document key, as on Elasticsearch.
- Find Record on an external Elasticsearch source also finds a record by the id its search results and lists of matches give (Elasticsearch's own document id).
- Searches, AI calls and tool runs made from an admin test chat, the playgrounds or a tool's Test panel are no longer counted as live traffic: Analytics leaves them out of searches, conversations, AI usage, tool usage and insights.
- The analytics Ask chat narrows popular and failed searches to visitors' or the assistant's when the question is about who searched.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
