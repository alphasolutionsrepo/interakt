# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `CLIENT_IP_SOURCE` setting: where Interakt reads a client's address for per-client rate limits: `forwarded-for:N` (N proxies in front of Interakt add to `X-Forwarded-For`), `header:<name>` for an edge's own header such as `CF-Connecting-IP` or `X-Azure-SocketIP`, or `none`. Unset, it uses `forwarded-for:<TRUSTED_PROXY_HOPS>`, so `TRUSTED_PROXY_HOPS` (the number of proxies in front of Interakt, default 1) keeps working as the fallback. Requests without a usable address share one count at 10 times the per-client limit.
- Health has a Client addresses check. It shows degraded, and the home page lists "Check how client addresses are read", when `CLIENT_IP_SOURCE` is `none` or not understood, or when requests keep arriving without a usable address; it clears within the hour once the setup is fixed.
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
- Analytics migration `0014` adds the `searched_query` column to search events (`npm run db:migrate-analytics`).
- Main database migrations `0035` to `0043` (`npm run db:migrate`): an index's last job, roles, built-in experiences and help resources, models that can shorten vectors, feature switches, the provider connection type, models hidden by discovery, and AI provider keys in the Secrets Vault. Run them when you upgrade.
- Roles and permissions for the admin. Admin is built in and holds every permission; Editor and Viewer are default roles you can rename, edit or delete, and you can add your own on the new Roles tab of User Management, which also has an Access overview of every role against every permission. Every admin API route checks the permission it needs against the user's current role on each request, so a role change or deactivation applies on the next request. Nobody can give out more than they hold, only an Admin manages Admins, and one active Admin always remains. On upgrade, existing users move to the closest role: admin to Admin, moderator to Editor, user to Viewer. Viewer is read-only, so users who could edit as `user` before can't until an Admin gives them another role. Review the roles after upgrading and adjust what Editor and Viewer can do.
- The admin follows each user's role on every page: pages a role can't open are left out of the menu and links, and actions it can't take show locked with the reason on hover. The built-in Help assistant, docs search and what the docs setup made for them can be changed only by an Admin. The account menu has "Change password".
- Feature switches: in Settings → Features an Admin turns off the areas the installation doesn't use (Search, AI summaries, Chat, Managed indexes, Analytics, Playground, Help assistant). An area that is off leaves the menu and its pages, its API routes answer 404 "This feature is turned off for this installation.", and its background work stops; its data is kept, so turning it back on restores everything. `INTERAKT_FEATURES_OFF=chat,analytics` turns areas off for the whole deployment, and an Admin can't turn those back on. The switches are also available at `GET`/`PUT /api/settings/features`.
- AI providers have a name you choose and a connection type, OpenAI-compatible (OpenAI, a self-hosted gateway or router, vLLM, LM Studio) or Ollama, so OpenAI and any number of OpenAI-compatible services can be connected side by side. Existing providers keep the API their key chose (the `ollama` one speaks Ollama, the rest OpenAI-compatible).
- Discover Models works for every provider, OpenAI-compatible ones included: it adds new text and embedding models, and hides models a service stops listing (a hidden model comes back when listed again). On a Cloud provider new models are added switched off for you to choose. After upgrading, the first Discover Models switches back on any Ollama models that Ollama still lists.
- An Ollama provider with an API key sends it as a bearer token. When a provider answers "too many requests" with a wait time, Interakt waits that long before trying again, and errors name the provider.
- Chat and text models have a Reasoning setting (Model default, Off, Minimal, Low, Medium, High) for thinking models that can spend their whole token budget before answering. Model default sends nothing, so existing models behave as before.
- Query understanding now also helps search experiences that use an external index such as Sitecore Search: the visitor's question is rewritten into search terms for that engine. Each search experience has a time limit for it (default 3 seconds, 0.5 to 10); when it is reached, search goes on with the visitor's own words. Traces show the outcome, and analytics group searches by what the visitor typed and show what was actually searched.
- HTTP tools: `{{input.field}}` can fill the URL's path and query (`https://api.example.com/orders/{{input.id}}`), the headers and the body, while the host stays as the admin set it. A URL that lets input choose the host is refused on save with what to change, and a tool saved that way earlier shows Needs setup. A URL without `https://` and a `{{secret:name}}` naming a missing secret each get a message that says what to fix.
- Failures are explained to whoever hit them: admins see what failed and what to do (a search engine or AI provider that refused, a write block on an index, a setup step left to do, an unreachable database), visitors and public API clients get a plain message with a code and a request id, and each failure is logged once with that id. The Activity panel keeps failed and partial actions findable.
- A Features page in the docs listing everything Interakt can do.

### Changed

- AI provider API keys live in the Secrets Vault. A key entered on a provider is saved encrypted as the vault secret `ai_provider_<provider key>`, or the provider form can use an existing vault secret (needs a role that can manage secrets). Keys saved on providers before move into the vault when the server starts with `SECRETS_ENCRYPTION_KEY` set, and saving a key needs that setting. The vault won't delete a secret a provider uses. A typed key never changes a vault secret something else uses: it gets its own secret. Editing a provider that uses a chosen vault secret needs a role that can manage secrets. After the move, an earlier version needs provider keys entered again.
- Validation errors give every field problem a stable `code` (`invalid_type`, `too_small`, `too_big`, `invalid_format`, `invalid_value`, `unrecognized_key`, `invalid`) beside its message, and the messages are Interakt's own ("This field is required.", "Enter a number of at most 100."). The public API reference documents the full error response, including `fields`. Analytics and trace requests with invalid parameters answer with the same field list instead of raw validation output.
- AI experiences enforce their allowed origins, chats per minute (default 60) and requests per day (default 10,000 chat messages per experience). Settings saved on existing AI experiences take effect on upgrade.
- Per-client rate limits identify a client by the address `CLIENT_IP_SOURCE` names; by default that is the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` places from the end. Each address has one form, and IPv6 clients are counted per /56 prefix.
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
- Node.js `>=24.22.1 <25` is now required (it was `>=24.0.0`). The Docker image and CI already use the latest 24.x.
- A search experience returns the fields its indexes show in responses, and a caller's `includeFields` picks from those; with every field of an index off, results carry their id only. Batch progress and cancel find an upload batch through the index it was uploaded to.
- Ingestion-key requests to the document routes are rate limited by the verified key (each live key has its own count per index), and failed key checks are counted per client, by the address `CLIENT_IP_SOURCE` names.
- Elasticsearch searches send only text fields to full-text queries, and the field API refuses the searchable flag on number, date and boolean fields.
- Embedding models that can shorten their vectors (such as `qwen3-embedding`) are asked for the size the index expects, so indexing and search match the index's dimensions.
- Sitecore Search filter values are sent as the type discovery recorded for each attribute; a value that can't be converted is reported as not applied.
- The tools API `GET /api/tools/:id/experiences` returns the experiences that use a tool (names only for roles that can view chat experiences), and the Experiences page counts (Total, Active, chat, search) match on every tab and follow the search and status filters.
- A reindex stopped by a failing embedding model says so, from the provider's error. An AI call is not retried when its caller stops waiting.
- Log lines keep a visitor's words (search and autocomplete queries, the AI summary, query understanding, Find Record values, zero-result retries, knowledge search, and the `LOG_ES_QUERIES` request log) only when the experience's telemetry level is Full. At Metadata or Off they log the length instead (`queryLength`), and filters by field without their values.
- The search widget stops an AI summary that is still being written when the visitor closes the search (Esc, the close button or the backdrop) or the widget is removed from the page; reopening on the same query writes it again. The demo site stops it when the visitor leaves the page.
- Query understanding for an external index searches with plain words: search syntax in the model's answer (quotes, wildcards, OR and similar) is kept only on words the visitor typed that way, a word the model excluded ("-used", "NOT wool") is left out rather than searched for, and an answer with no words left searches with the visitor's own words. With AI summaries off, traces record no query understanding steps, and the trace view shows the visitor's words beside the search terms. Latest searches and the Ask chat say "searched with filters only" when every word of a question became a filter.

### Fixed

- A chat continues a conversation only with the experience that started it; a session id from another experience starts a new conversation.
- Output safety rules on an AI experience now apply before the answer reaches the visitor or is saved to the conversation, and also to replies to greetings and off-topic questions. Before, the visitor got the unchecked answer. A blocklist output rule set to redact now replaces the listed words; before, it changed nothing.
- The production Docker image builds again: it installs dependencies with the backend's `.npmrc`, as CI and local installs do. CI now builds the image, migrates with it and starts it on every PR.
- An access token or ID that isn't a UUID no longer answers 500. A public API request with such a token answers 401, like an unknown token. An admin request with such an ID answers 400 "That ID isn't valid.", and an unknown job or queue answers 404.
- The server starts with the current OpenTelemetry packages: the startup step that sets up tracing and the search providers loads them as ES modules. CI now builds, migrates and starts the app on every PR.
- The filter box on the AI Experiences, Search Experiences, Search Indexes, Data Sources, Tools and MCP Connections lists no longer loses focus while the list reloads.
- Find Record on an Azure AI Search index goes on to search by name when the id isn't a document key, as on Elasticsearch.
- Find Record on an external Elasticsearch source also finds a record by the id its search results and lists of matches give (Elasticsearch's own document id).
- Searches, AI calls and tool runs made from an admin test chat, the playgrounds or a tool's Test panel are no longer counted as live traffic: Analytics leaves them out of searches, conversations, AI usage, tool usage and insights.
- The analytics Ask chat narrows popular and failed searches to visitors' or the assistant's when the question is about who searched.
- Experience and tool slugs made by the create wizards never start or end with a dash.
- "Used in" on a tool's page shows the experiences that use it, and the "Used in AI Experiences" card appears.
- The Inactive filter on Search Experiences lists inactive experiences, and the search box matches name, slug or description (not case-sensitive) on both kinds.
- Saving the model form keeps the capabilities it doesn't show (context window, streaming, details from an Ollama sync) and accepts keys such as `qwen3.5:9b` and `openai/gpt-5`.

### Removed

- The `Access-Control-Allow-Credentials` response header.
- The separate hourly rate limit on search token routes.

### Security

- Public experience routes apply the experience's allowed origins and rate limits through one shared check.
- Server calls to addresses an admin sets (AI providers, external search sources, data source checks, MCP servers, web search) follow redirects only on the same server. A redirect to another server stops the call and names that server.
- zod 4, for a security fix in validation. Requests are checked as before, except numbers that JSON can't carry exactly (infinity, whole numbers above 2^53), which are now rejected.
- Dependencies were updated for security fixes: Next.js, next-auth, axios, DOMPurify and the Elasticsearch client, with other updates from `npm audit fix`.

[Unreleased]: https://github.com/alphasolutionsrepo/interakt/commits/main
