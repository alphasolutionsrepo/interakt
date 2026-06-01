# @interakt/widgets

Self-contained drop-in search and chat widgets for Interakt.

## Isolation

This package is isolated from the parent Next.js backend:

- Separate `package.json` / `node_modules`
- Separate `tsconfig.json` with `jsxImportSource: 'preact'`
- Built with Vite in library/IIFE mode
- Backend's `tsconfig.json` excludes `widgets/`
- Nothing in `backend/src/**` imports from `widgets/src/**` (and vice versa)

The **only** crossing between this package and the backend is the built bundle,
which is copied from `widgets/dist/` into `backend/public/embed/v1/` by a Vite
post-build plugin.

## Build

```
npm install
npm run build    # one-shot: emits dist/widgets.js and copies to backend public
npm run dev      # watch mode: rebuild+copy on every save
```

## Usage on a customer page

```html
<div id="chat"></div>
<script src="https://<your-interakt-host>/embed/v1/widgets.js"></script>
<script>
  window.ChatDropinUI.init({
    containerId: 'chat',
    accessToken: '<access-token-from-admin>',
  });
</script>
```

## Architecture

- **Preact + signals** for a lean runtime (~10 KB)
- **Shadow DOM** (open mode) with `adoptedStyleSheets` for style isolation
- **Native `fetch` + `ReadableStream`** for SSE chat / summary streaming
- **`marked` + `DOMPurify`** for safe markdown rendering

Bundle target: **< 100 KB gzipped**.

## Chat widget (`window.ChatDropinUI`)

```ts
ChatDropinUI.init({
  containerId: string;
  accessToken: string;                          // required
  apiBaseUrl?: string;                          // default: the script's origin

  // Launcher
  launcher?: 'floating' | 'inline' | 'button';  // default 'floating'
  placement?: 'bottom-right' | 'bottom-left'
            | 'top-right'    | 'top-left';      // default 'bottom-right'

  // Branding
  theme?: 'light' | 'dark' | 'auto';            // overrides admin embedConfig
  primaryColor?: string;                        // hex; overrides admin embedConfig

  // Overrides (fall back to the experience's admin-configured widget-config)
  chatTitle?: string;
  initialMessage?: string;

  // Analytics hook
  onEvent?: (e: WidgetEvent) => void;
})

// Headless API — primarily useful when launcher === 'button'
ChatDropinUI.open(containerId?)
ChatDropinUI.close(containerId?)
ChatDropinUI.destroy(containerId?)
```

### Launcher modes

- **`floating`** (default) — widget renders its own bubble pinned to the viewport corner (`placement` decides which). Click opens the panel.
- **`inline`** — panel renders fully expanded inside the target container. No launcher.
- **`button`** — widget renders nothing until the host calls `window.ChatDropinUI.open()`. Use this when you want to wire your own header button, side nav link, or keyboard shortcut.

Example (`button` mode):

```html
<button id="my-help-btn">Help</button>
<div id="chat"></div>

<script src="https://…/embed/v1/widgets.js"></script>
<script>
  window.ChatDropinUI.init({
    containerId: 'chat',
    accessToken: '…',
    launcher: 'button',
  });
  document.getElementById('my-help-btn')
    .addEventListener('click', () => window.ChatDropinUI.open());
</script>
```

## Search widget (`window.SearchDropinUI`)

```ts
SearchDropinUI.init({
  containerId: string;
  accessToken: string;
  apiBaseUrl?: string;

  mode?: 'modal' | 'inline';   // default 'modal' (⌘K opens)
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;

  onEvent?: (e: WidgetEvent) => void;
})

SearchDropinUI.destroy(containerId?)
```

In `modal` mode, **⌘K / Ctrl+K** opens the search anywhere on the page; **Esc** closes it.

## Event catalog

Every host can pass `onEvent` to pipe widget activity into GA4, Segment, PostHog, Mixpanel, etc.

| Event | When it fires | Payload |
|---|---|---|
| `chat:open` | User (or host) opens the chat panel | — |
| `chat:close` | User (or host) closes the chat panel | — |
| `chat:send` | User submits a message (before the request goes out) | `{ message: string }` |
| `chat:suggested_question_clicked` | User taps a suggested question on the welcome screen | `{ question: string }` |
| `chat:done` | Backend stream finished (close of SSE connection) | `{ sessionId?: string }` |
| `chat:message_received` | Assistant reply fully delivered — use this for conversion tracking | `{ text, sessionId?, hasSources, hasPreset }` |
| `chat:error` | Stream failed | `{ message: string }` |
| `chat:new` | User clicked the New-chat button | — |
| `search:open` | Search modal opened (click or ⌘K) | — |
| `search:close` | Search modal closed | — |
| `search:query` | Query submitted (fires before results land) | `{ query: string }` |
| `search:results` | Results returned for a query | `{ query: string, count: number }` |
| `search:no_results` | Query returned zero hits | `{ query: string }` |
| `search:result_clicked` | User clicked a result row | `{ id: string, url?: string }` |

## Deferred capabilities

These require backend support and aren't available yet:

- **`user: { id, email, name }`** — pass the logged-in user so chat can personalize and the admin can attribute conversations. Needs chat/search endpoints to accept the field.
- **`context: { url, pageTitle, metadata }`** — pass current page context to ground retrieval. Needs pipeline wiring on the backend.
- **`locale`** — localized welcome / greeting / placeholder. Needs i18n on `GET /api/v1/ai-experiences/widget-config`.
