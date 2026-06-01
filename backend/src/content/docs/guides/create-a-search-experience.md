---
sidebar_position: 4
---

# Create a search experience

A [search experience](../concepts/search-experiences) is the user-facing thing — the search box on your site. This guide walks through the wizard and embedding the result on your site.

## Before you start

- At least one [search index](create-a-search-index) with data loaded.
- You know where the search box should live on your site (or you're building a custom frontend that will call the API).

## 1. Open the wizard

Sidebar → **Experiences** → **New Experience** → **Search Experience**.

## 2. Basic info

| Field | What to put |
|---|---|
| **Name** | Display name shown in the admin and (sometimes) to users. *"Product search"*. |
| **Slug** | URL path. Auto-generates from the name. **Can't be changed later.** |
| **Description** | Optional, internal. |
| **Index** | Pick the index this experience searches. First one gets role **Primary**. |

For multi-index experiences, add more indexes here — each one as Primary or Secondary. Most setups have one index per experience; multi-index is for blending different data (e.g. products + help articles in one search bar).

Click **Next**.

## 3. Search settings

| Field | Default | Tweak when |
|---|---|---|
| **Default page size** | 10 | Match your design. |
| **Max page size** | 100 | Cap so a misbehaving client can't ask for 100,000. |
| **Result highlighting** | On | Off only if your frontend doesn't render highlights. |
| **Faceted search** | On | Required for any filter UI. |
| **Enable autocomplete** | On | Off if you don't want type-ahead suggestions. |
| **Autocomplete mode** | Prefix-based | Switch to Semantic if your data is concept-heavy. |
| **Suggestion limit** | 5 | More for richer suggestion UX. |
| **Allowed origins** | empty | **Add your production domain and your dev URL.** Without these, browser calls fail CORS. |

If you have multiple indexes attached, you'll also see:

- **Multi-index strategy** — Union (default), Intersection, or Weighted.
- **Result merge strategy** — RRF (default) or Score Weighted; Custom for sliders.

For most cases the defaults are right.

Click **Next**.

## 4. AI configuration (optional)

Skip this step (leave the toggle off) for now if you just want search to work.

If you want AI-generated summaries on top of the results:

- Toggle **Enable AI features** on.
- Toggle **Enable summary** on.
- Set summary length, tone, and any custom instructions.

See [Search experiences → AI configuration](../concepts/search-experiences) for what each setting does.

Click **Next**.

## 5. Display configuration

This is what makes result cards look like real products / articles, not like a JSON dump.

For each role you care about, pick the field:

| Role | Pick the field that is… | Example |
|---|---|---|
| **title** | The thing's name | `name`, `title`, `headline` |
| **subtitle** | A category, brand, or tagline | `brand`, `category` |
| **image** | An image URL | `image_url`, `thumbnail` |
| **price** | A number representing money | `price`, `cost` |
| **badge** | A short status pill | `status`, `availability` |
| **link** | A URL to the full detail page | `product_url`, `permalink` |

You don't have to fill every role. Title + image + price is enough for a usable product grid.

See [Display configuration](../concepts/display-configuration) for the full breakdown.

Click **Create**. You land on the detail page.

## 6. Activate

In the header of the detail page, click **Activate** (if it shows that). Inactive experiences exist but reject incoming traffic.

## 7. Embed it on your site

Expand the **Search Widget** card on the detail page.

1. Pick the **theme** (Light / Dark / Auto).
2. Pick the **primary colour** to match your brand.
3. Pick **Mode**:
   - **Modal** — a button that opens search as an overlay. Easy to drop in anywhere.
   - **Inline** — renders directly inside a container `<div>` you specify. Use the **Container ID** field to name the target element.
4. (Inline only) Set the **container ID** of the target `<div>`.
5. Watch the preview update.
6. Click **Save** to persist the widget configuration.
7. Click **Copy** to copy the embed snippet.

Paste the snippet into the HTML of your site, on every page where you want search to appear. For SPAs, paste it into the top-level template.

See [Embed widgets](../concepts/embed-widgets) for the full set of configuration options.

## 8. Calling the API from a custom frontend

If you're building your own UI instead of using the widget, your frontend calls the experience's search endpoint with the access token. The detail page's **Access Token** card has a curl example to copy from.

The general shape:

```
POST /api/v1/search-experiences/<your-slug>/search
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "query": "denim jacket",
  "limit": 20,
  "filters": { ... }
}
```

## Common gotchas

- **CORS errors in the browser.** You forgot to add the origin under **Allowed origins**. Add the full URL including protocol — `https://your-site.com`, not just `your-site.com`.
- **Widget loads but no results.** The experience isn't activated. Hit **Activate** in the header.
- **Token says HTTP 401.** Token is wrong, regenerated, or for a different experience. Copy the current one from the Access Token card.
- **Search returns nothing.** Check the underlying index in **Playground → Index Search**. If the index works there but not through the experience, the experience may have a filter or default that's eliminating results.
- **Slug already taken.** Slugs are unique system-wide. Pick a different one.

## Where to go next

- [Display configuration](../concepts/display-configuration) — making result cards look good.
- [Embed widgets](../concepts/embed-widgets) — the snippet, in detail.
- [Access tokens](../concepts/access-tokens) — how the credential works.
- [Create a chat experience](create-a-chat-experience) — add an AI chat to the same data.
