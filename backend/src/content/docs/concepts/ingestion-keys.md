---
sidebar_position: 23
---

# Ingestion keys

An **ingestion key** is the credential an external system uses to push documents into a search index — a CMS sync, an ETL job, a nightly export. It is a server-side secret that can write and delete.

It is **not** the same thing as an [access token](access-tokens), and the two are not interchangeable. If you have been handed a token and are trying to upload with it, you want a key instead.

## Ingestion key or access token?

|  | Access token | Ingestion key |
|---|---|---|
| **Used by** | Browsers, widgets, frontend apps | Servers, sync jobs, CI |
| **Can it be seen by the public?** | **Yes — by design.** It is baked into the embed snippet and readable from the page source. | **No.** Never put one in a browser. |
| **What it can do** | Search, autocomplete, read one document | Add, update, and delete documents |
| **Scoped to** | One experience | Specific indexes + specific operations |
| **Stored as** | Plain value on the experience | Hashed. Shown once, never recoverable. |
| **Revocable** | By rotating the token | Yes, immediately |
| **Header** | `X-Access-Token` or `Authorization: Bearer` | `Authorization: Bearer` only |

The distinction is the whole point: an access token is safe to publish because it can only read. Writes and deletes need a credential that is genuinely secret, which is why they get their own type.

## Creating a key

Sidebar → **Capabilities → Search Indexes** → open your index → **Ingestion Keys** card.

Give it a name you'll recognise later ("Storyblok sink (EN)") and tick the permissions it needs:

- **Write** — add and update documents
- **Delete** — remove documents

Grant only what the integration actually does. A sync that only ever pushes content does not need delete.

The key is shown **once**, on creation:

```
ik_a1b2c3d4e5f6_xK9mP2qR7sT4vW8yZ1aB3cD5eF7gH9jK2mN4pQ6rS8t
```

Copy it immediately. It is stored as a hash, so there is no way to look it up later — a lost key has to be revoked and replaced. After creation the list shows only the `ik_…` prefix, which is enough to tell keys apart.

## Using a key

Send it as a bearer token:

```bash
curl -X POST "$INTERAKT_URL/api/search-indexes/$INDEX_ID/documents" \
  -H "Authorization: Bearer $INTERAKT_INGESTION_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"documents": [{"id": "PROD-001", "name": "Pacific runner sneaker"}]}'
```

The same header works on every document endpoint — see the
[Ingestion API reference](../guides/ingestion-api-reference) for the full list.

Reading is always allowed for an index the key is scoped to, so a sync can verify its own writes without extra permissions.

**Sending the header at all commits you to it.** If an `Authorization` header is present but the key
is bad, the request fails with `401` rather than falling back to your logged-in session. That is what
stops a broken deploy from appearing to work simply because you happened to be signed in while
testing it.

## What happens when a key isn't allowed

| Response | Meaning |
|---|---|
| `401` | Missing, malformed, unknown, revoked, or expired key |
| `403` | Valid key, but not permitted here — wrong index, or missing the operation |

The messages are deliberately vague. These endpoints are internet-facing, and a precise error ("no such index") would let someone map your setup by guessing.

## Scope and lifetime

Two options beyond the defaults, both set at creation:

- **More than one index.** A key is scoped to the index it was created on. Pass
  `additionalSearchIndexIds` when creating it via the API to grant others — useful when one sync
  feeds several indexes and you would otherwise juggle a key per index.
- **An expiry date.** `expiresAt` makes a key stop working on its own. An expired key behaves
  exactly like a revoked one (`401`). Worth setting for a contractor integration or a one-off
  migration, so the credential does not outlive the work.

Keys are also how **rate limiting** is counted: each key gets its own budget, so one noisy
integration cannot exhaust another's. The limits are per endpoint and documented in the
[API reference](../guides/ingestion-api-reference#rate-limits).

## Managing keys over the API

Keys can be created, listed and revoked programmatically, but **only with an admin session** — an
ingestion key cannot create another ingestion key. That restriction is the point: a leaked key
cannot be used to widen its own access or mint a replacement.

See [Ingestion API reference → Ingestion keys](../guides/ingestion-api-reference#ingestion-keys).

## Rotating and revoking

Revoke from the same card. It takes effect immediately, with no redeploy — the next request from that key gets a `401`.

To rotate without downtime: create the new key, deploy it to the integration, confirm traffic is flowing, then revoke the old one. Both work at once, so there is no gap.

Revoke straight away if a key is committed to a repository, pasted into a ticket, or sent over chat.

## Auditing

Every upload records which key made it. The batch history on the index shows uploads from the admin UI and from each key separately, and `lastUsedAt` on the card tells you whether a key is still in use — handy for finding keys you can safely revoke.

## Good practice

- **One key per integration.** Shared keys can't be revoked without breaking every consumer.
- **Least privilege.** Skip `delete` unless the integration genuinely deletes.
- **Environment variables, not code.** Never commit a key.
- **One key per environment.** Staging should not hold a key that reaches production data.

## Common gotchas

- **Using an access token to upload.** Returns `401`. Access tokens cannot write — that is deliberate, not a bug.
- **`X-Access-Token` with an ingestion key.** Not read on these endpoints; use `Authorization: Bearer`. The headers are kept separate so a public token can never be mistaken for a secret one.
- **A key scoped to the wrong index.** Returns `403`. A key only reaches the indexes it was granted.
- **Expecting to see the key again.** You can't. Only the prefix is retained.
- **Browser calls with an ingestion key.** These endpoints send no CORS headers, because a secret key has no business being in a page.

## Where to go next

- [Ingestion API reference](../guides/ingestion-api-reference) — every endpoint these keys unlock
- [Loading data into an index](../guides/bulk-load-data) — the task-oriented guide
- [Access tokens](access-tokens) — the read-only, public counterpart
