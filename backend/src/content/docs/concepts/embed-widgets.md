---
sidebar_position: 10
---

# Embed widgets

The fastest way to put an Interakt experience in front of users is the **embed widget** — a single `<script>` tag plus a `<div>` you paste into your site. The widget handles the search box (or chat window), the styling, the API calls, and the access token in one drop-in.

Both search experiences and AI/chat experiences have one. The screens are in the experience's detail page.

## Where to find it
Sidebar → **Experiences** → pick any experience → **Search Widget** card (search experiences) or **Chat Widget** card (AI experiences).

## What you get

Two pieces of code:

```html
<div id="interakt-search"></div>
<script src="https://cdn.interakt.example/widget.js"
        data-experience="product-search"
        data-token="sk_••••••••"></script>
```

Paste them into the HTML of any page where you want the search box or chat to appear. The script self-initialises — no further setup.

The widget renders into the `<div>` you specify (or floats over the page, for chat).

## The configuration card

Both widget cards have a live preview and an editor. Changes to the editor update the preview in real time; click **Copy** to copy the snippet with your current configuration baked in. Click **Save** to persist the configuration so it loads automatically next time someone embeds the widget.

### Common fields (search and chat)

| Field | What it controls |
|---|---|
| **Theme** | Light, Dark, or Auto (follow visitor's system preference). |
| **Primary colour** | Hex value used for the action button, focus states, accents. Match your brand. |
| **Background colour** | The panel background. |
| **Surface colour** | The card / row background — slightly different from the panel for layering. |
| **Border radius** | Rounded corners. In pixels. `8` is a soft default; `0` gives sharp corners. |
| **Font family** | CSS font stack. Default is the system stack. Set to your brand font if it's loaded on the page. |
| **Mode** | Modal (button opens an overlay) or Inline (renders directly into a container element). |
| **Container ID** | The `id` of the `<div>` you want the widget to render into, for inline mode. |

### Search-specific fields

| Field | What it controls |
|---|---|
| Search box placeholder | The text shown when the box is empty. |
| Show filters | Whether to render facet filters next to results. |
| Show suggestions | Whether autocomplete suggestions appear as the user types. |
| Result card layout | Grid, list, or compact. |

### Chat-specific fields

| Field | What it controls |
|---|---|
| **Welcome message** | The first message the chat shows when opened. |
| **Welcome description** | Subtitle under the welcome. |
| **Input placeholder** | "Ask me anything…" |
| **Suggested questions** | Buttons users can click instead of typing. Add by typing and clicking "Add". |
| **Launcher** | Floating button (bottom-right) or Tab (fixed to one side of the page). |
| **Placement** | Bottom-right / bottom-left / top-right / top-left for the floating launcher. |
| **Logo URL** | A small logo at the top of the chat panel. |
| **Show branding** | Whether the "Powered by Interakt" footer shows. |

## Modal vs inline

### Modal *(default)*
The widget renders as a button (or floating launcher for chat). Clicking it opens the search or chat panel as an overlay on top of the page.

Pros:
- Doesn't disrupt existing page layout.
- One snippet works on every page of your site.
- Good for global search or a "help" chatbot.

Cons:
- Not great if you want search to *be* the page (a dedicated search results page).

### Inline
The widget renders directly inside the container `<div>` you specify. It takes up that space in the page.

Pros:
- You control exactly where it sits.
- Good for dedicated search pages or chat embedded inside a "support" page.

Cons:
- You're responsible for sizing the container and the layout around it.

## How the snippet works

The snippet does three things:

1. **Loads the widget script** from a CDN (or your own host).
2. **Reads the experience slug and access token** from the data attributes.
3. **Renders into the container** (or as a launcher).

The access token in the snippet is the experience's access token, which is **bound to the allowed-origins list** on the experience. That's why a leaked token can't be used from a domain you haven't allowed — the API rejects requests with a missing or mismatched Origin header.

## Updating the widget

The widget script auto-fetches the latest configuration from Interakt on every load. So if you change the colours or the welcome message in the admin and click **Save**, every page that has the widget picks up the new config on next page load. **You don't need to re-paste the snippet** — only re-paste when you change the slug or token.

## Multi-page sites

Paste the same snippet into every page where you want the widget. It de-duplicates itself if the script is loaded twice. For SPAs, load it once at the top level.

## Custom frontend instead of the widget

You don't have to use the widget. The same experiences are reachable as REST endpoints — the snippet is just a convenience wrapper. If you have a custom frontend, see [Access tokens](access-tokens) for how the API auth works, and the in-app **Playground → Experience Search / AI Service** to see actual request and response shapes.

## Common gotchas

- **CORS errors.** Make sure the page's origin is in **Allowed origins** on the experience. The browser console error mentions "blocked by CORS policy" — that's the give-away.
- **Widget doesn't appear in modal mode.** Check that the `<script>` tag finished loading by the time the page renders. If it's at the bottom of the body, it might be deferred.
- **Wrong theme.** Auto follows the OS. If your visitors are mostly on dark-mode OSes and you wanted light, lock the theme.
- **Suggested questions look broken.** Suggested questions are buttons — keep them short. "What's the return policy?" yes, three-sentence questions no.
- **The widget shows but the experience says it's inactive.** Activate the experience from the detail page. Inactive experiences load the widget chrome but the requests are rejected.

## Where to go next

- [Access tokens](access-tokens) — the credential model that secures the widget.
- [Display configuration](display-configuration) — what each result card shows (search experiences).
- [Search experiences](search-experiences) / [Chat experiences](chat-experiences) — the underlying configuration the widget reflects.
