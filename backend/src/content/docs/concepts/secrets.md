---
sidebar_position: 17
---

# Secrets

The **Secrets Vault** is a place to store credentials — API keys, passwords, tokens — that you don't want hard-coded into tool configurations or visible in the admin UI. You save a secret once, give it a name, and refer to it elsewhere using `{{secret:name}}`. Interakt encrypts it at rest and resolves the placeholder at the moment a tool runs.

## Where to find this screen
Sidebar → **Platform → Secrets Vault**.

## What the screen does

A table of secrets with their names, descriptions, and timestamps. The **values are never shown** after they've been saved — that's the whole point. To change a value, you edit the secret and paste a new one.

### Stats cards (above the table)
- **Total Secrets** count.
- **Last Updated** timestamp.

### Toolbar
- **Search input** — by name.
- **Refresh** button.
- **New Secret** button.

### Table
| Column | What |
|---|---|
| Name | The identifier referenced as `{{secret:name}}`. |
| Description | What it's for. |
| Created | When it was added. |
| Updated | When it was last changed. |
| Actions | Edit / Delete dropdown. |

## Creating a secret

Click **New Secret**. The dialog asks for:

- **Name** — short, descriptive, no spaces. Conventionally lowercase with underscores: `orders_api_key`, `stripe_webhook_secret`. Once created, the name **cannot be changed** — references would break.
- **Value** — the actual credential. Pasted into a password-style field. Never shown again after save.
- **Description** — optional, free-text. *"OpenAI key for the order-tracking tool"*. Worth filling in; future you will not remember what `auth_token_3` was for.

Click **Save**. The secret is encrypted and stored. Use it via `{{secret:orders_api_key}}` in tool configs.

## Editing a secret

The edit dialog has the same fields as create, with these differences:

- **Name** is shown but read-only.
- **Value** is optional in edit mode — leave it blank to keep the existing value, paste a new one to replace.
- **Description** is editable.

## Deleting a secret

Confirms first. Deletion is hard — Interakt does **not** check whether any tools reference the secret. If you delete a secret that a live tool uses, the tool fails at runtime with a "secret not found" error.

Before deleting, search the tools list for `{{secret:name}}` references. (The tool detail page shows the raw config — including secret references.)

## Referencing secrets in tools

In any HTTP tool's URL, header, query parameter, or body template, use the placeholder:

```
{{secret:orders_api_key}}
```

At runtime, Interakt replaces it with the decrypted value. Some examples:

| Where | How |
|---|---|
| URL | `https://api.example.com/orders?key={{secret:orders_api_key}}` |
| Header | `Authorization: Bearer {{secret:orders_api_key}}` |
| Body | `{ "api_key": "{{secret:orders_api_key}}", "order_id": "{{input.order_id}}" }` |

The same placeholder syntax works for any custom executor that supports templating.

## What the encryption protects

- Secrets are encrypted with a key from the Interakt server's configuration. The key is not stored in the database.
- The decrypted value is held in memory only for the moment a tool runs.
- Secrets do **not** appear in logs, traces, or the admin UI after save.
- An admin who has database access **cannot** read secret values without the encryption key.
- The system has no "show me the value" button — there is no way, by design, to retrieve a saved value through the admin UI. If you've forgotten what a secret was, rotate it at the source and update the secret here.

## When to use a secret vs an inline value

Use a secret when:

- The value is a credential (API key, password, token).
- The value is shared across multiple tools.
- The value rotates and you'd rather change it in one place.

Don't bother with a secret for non-sensitive shared config (a base URL, a default region). Templating supports `{{config:key}}`-style references for non-sensitive shared values in some configurations.

## Common gotchas

- **Forgetting to wire the secret into the tool.** You create the secret but the tool config still has the literal API key (or a different reference). Edit the tool and replace the literal with `{{secret:your_name}}`.
- **Typos in the secret name.** `{{secret:orderskey}}` vs `orders_key` will silently fail at runtime. The tool detail page shows the raw config — eyeball it.
- **Deleting a secret in use.** No safety net. Search before you delete.
- **Trying to read a secret back.** You can't, by design. If you forgot what it was, rotate at source and update here.

## Where to go next

- [Tools](tools) — where most secret references live.
- [AI providers](ai-providers) — sometimes provider credentials route through secrets too.
- [Data sources](data-sources) — external sources often need authenticated connections.
