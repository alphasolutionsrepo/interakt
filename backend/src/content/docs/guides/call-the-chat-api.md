---
sidebar_position: 11
---

# Calling the chat API directly

The [drop-in chat widget](../concepts/embed-widgets) is the easiest way to put a chat experience on your site. If you're building a custom chat UI or calling from a backend, you can call the chat API directly with the experience's access token.

## The basics

Every AI experience has a public chat endpoint at:

```
POST /api/v1/ai-experiences/<slug>/chat
```

Authenticated with the experience's access token. The response is a **server-sent events (SSE)** stream — the AI's reply comes back in chunks as it's generated, plus events for tool calls and citations along the way.

A complete request:

```bash
curl -N -X POST "https://admin.interakt.app/api/v1/ai-experiences/<slug>/chat" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "X-Access-Token: YOUR_CHAT_ACCESS_TOKEN" \
  -d '{"message":"Find me a warm winter coat"}'
```

## Why use the API instead of the widget

- **Custom chat UI** — you want full control over the bubble, the avatars, the styling.
- **Mobile app** — there's no widget for mobile.
- **Backend-to-Interakt** — server-side automation that needs to converse with the AI.
- **Programmatic conversation** — testing, batch evaluation.

## Sessions

Interakt keeps the conversation history in a session. The widget handles this automatically; custom frontends need to:

1. Send the first message without a `sessionId`.
2. Read the `sessionId` from the stream's `done` event and store it (localStorage, cookie, memory).
3. Send that `sessionId` with every later message in the same conversation.

When the user closes the chat and reopens it days later, you decide whether to reuse the old session or start a new one based on your TTL.

## SSE — what events to expect

The stream sends a sequence of events. Common ones:

- `step_start` / `step_complete` — a pipeline step (guardrails, planning, tools, response) began or finished.
- `tool_call` — the AI decided to call a tool. Includes the tool name and arguments.
- `tool_result` — the tool finished, with its result count.
- `preset` — structured data to render, such as product cards, with the preset name.
- `content` — a chunk of the AI's response text, in `text`.
- `sources` — citations / referenced records from tool results.
- `error` — something went wrong; `message` says what.
- `done` — end of stream, with the `sessionId` to send next turn.

Your frontend renders `content` chunks as they arrive. The other events are useful for showing "thinking" indicators, tool-use UI, and citations alongside the response.

## Where to find the full request and response shape

The exact JSON shape evolves. Two living references that are always current:

- **The Chat Playground.** The Chat Playground card on each AI experience detail page runs the same code path. The browser dev tools network panel shows the live request and SSE stream.
- **The request above**, with your experience's slug and token.

## Common gotchas

- **CORS errors from the browser.** Add your origin to the experience's allowed origins.
- **HTTP 401.** Wrong token or token revoked.
- **HTTP 429.** Rate-limited. Back off and retry.
- **Session resets on every turn.** Your client isn't sending the `sessionId` from the last `done` event. A request without one, or with an id Interakt didn't issue, starts a fresh conversation.
- **SSE buffering.** Some proxies buffer SSE streams, blocking real-time delivery. If responses arrive all at once instead of streaming, check whether your proxy / CDN supports streaming.

## Where to go next

- [Embed widgets](../concepts/embed-widgets) — the easier path.
- [Access tokens](../concepts/access-tokens) — how auth works.
- [Chat experiences](../concepts/chat-experiences) — the experience's full configuration.
- [Frontend frameworks](../integrations/frontend/) — framework-specific guides (React / Next.js) including the SSE streaming code wired into a real chat UI.
