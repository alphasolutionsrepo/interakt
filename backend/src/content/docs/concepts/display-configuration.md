---
sidebar_position: 9
---

# Display configuration

Search returns rows of data. Without display configuration, those rows are just a JSON blob your frontend has to figure out how to render. The **display configuration** is how you tell the widget (or any consumer) "this field is the title, this one is the price, this one is the image" — so the result card knows what to show big, what to show small, and what to ignore.

## Where to find it
Sidebar → **Experiences** → pick a search experience → **Edit** → **Display** tab.

It's also the last step of the search-experience creation wizard.

## What the screen does

A list of **roles** with a **field** picked for each. Add a role, choose which field fills it, optionally override its label.

If you skip this entirely, your widget renders generically — all fields shown with their field names. Configuring it is what turns "row of JSON" into "product card."

## The roles

Each role has a meaning the widget knows how to render.

| Role | What the widget does with it | Typical fields |
|---|---|---|
| **title** | The big text at the top of each card. | `name`, `title`, `product_name`, `headline` |
| **subtitle** | Smaller text below the title. | `brand`, `category`, `author`, `subtitle` |
| **description** | Longer body text — usually shown in a "more info" expand or below the card. | `description`, `summary`, `excerpt` |
| **image** | Renders as an `<img>` at the top or left of the card. Field must be a URL. | `image_url`, `thumbnail`, `photo` |
| **price** | Rendered formatted as currency. | `price`, `cost`, `amount` |
| **badge** | Small status pill on the card — usually top-right. | `status`, `availability`, `in_stock`, `new_arrival` |
| **secondary** | Extra small text — used for metadata like "added X days ago". | `created_at`, `views`, `rating_count` |
| **link** | Where clicking the card navigates. Field must be a URL. | `product_url`, `detail_url`, `permalink` |

You don't have to fill every role. A card with just `title` and `image` works fine for a minimal product grid. Filling more roles gives a richer card.

## The custom label

Each role has an optional **label** input. By default the widget uses the field's display name from your index. The label lets you override that for *this* experience.

Example: your index has a field called `vendor`. The default widget label is "Vendor". For this experience you want to call it "Brand" — set the label to "Brand". It's purely cosmetic and only affects this one experience.

## Order matters

You can drag fields (or use the arrow buttons) to reorder them. The order roughly corresponds to visual prominence — first role is shown most prominently, last is shown least.

For most layouts:

1. **title** — top, large.
2. **image** — illustration.
3. **subtitle / badge** — context, secondary info.
4. **price** — visually highlighted.
5. **description** — body.
6. **secondary** — fine print.
7. **link** — invisible (it's the click target).

The widget's CSS is designed around these conventions, but a custom frontend can do anything with them.

## Adding fields

The **Display Fields** card shows the configured roles. Below that, an **Add field** dropdown lists every field from every attached index where **Include in response** is true. Only fields the API returns are addable — if a field you want isn't listed, go back to the [index fields](index-fields) screen and turn on "Include in response."

When you pick a field, it joins the list with a role you choose. You can edit the role and label inline.

## Removing fields

Each row has an X button. Removes that field from the display config — it'll still be in the API response, the widget just won't render it specially.

## Multi-index experiences

If your search experience covers multiple indexes (e.g. products + articles), each index might have *different* fields for the same role. You can configure per-index display:

- Set a role in the unified display config, and the widget will look for that role in each index's results.
- If a result is from the `products` index and `title` maps to `name`, the widget uses `result.name`.
- If a result is from the `articles` index and `title` maps to `headline`, the widget uses `result.headline`.

This is set up by mapping fields per-index when you add them — each index contributes its own field to fill the role.

## What the widget does with the configuration

The drop-in search widget reads the display configuration from the experience's API response and uses it to render result cards. Specifically:

- **Title** is rendered as `<h3>` text.
- **Subtitle / badge** are rendered as small spans.
- **Image** is loaded as an `<img>` with the URL field's value.
- **Price** is formatted as currency using the locale of the visitor's browser.
- **Description** is collapsed by default; expanded with a "more" toggle.
- **Link** wraps the entire card in an anchor.

If you've built your own frontend (not using the drop-in widget), you can read these fields out of the search response and render them however you want.

## What happens without display configuration

If you don't configure anything:

- The widget shows every field returned by the API as a label–value pair, in alphabetical order.
- It's readable but ugly.
- All fields are equal-weighted visually.

For internal admin pages and quick tests, this is fine. For anything customer-facing, take 60 seconds and set up the display config.

## Common gotchas

- **The field has to be returned by the API** for it to show up. If your title field is set to "Include in response: off" on the index, the widget can't render it.
- **Image URLs need to be absolute.** Relative URLs won't load in the widget context.
- **Price field has to be a number.** A string like "$99.99" won't get formatted — keep prices as numbers in your index and let the display layer format them.
- **Badge looks like a tag, not free text.** Short values work best — "In stock" yes, "Available in 5 colours with free delivery" no.

## Where to go next

- [Embed widgets](embed-widgets) — once the display is configured, embed it.
- [Index fields](index-fields) — making sure the fields you want are in the response.
- [Search experiences](search-experiences) — the rest of the configuration.
