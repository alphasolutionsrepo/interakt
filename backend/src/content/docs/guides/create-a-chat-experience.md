---
sidebar_position: 5
---

# Create a chat experience

A [chat experience](../concepts/chat-experiences) is a chatbot you put in front of users. This guide walks through the wizard and embedding the result. About 15 minutes.

## Before you start

- An [AI provider configured](configure-an-ai-provider).
- Usually a search index too — chat is most useful when it can search your data. Have the index, fields, and data ready ([Create a search index](create-a-search-index)).
- The tools for that index need to exist. If you used Initial Setup or uploaded data via the standard flow, they were auto-created. Otherwise, go to the data source detail page and click **Create Tools**.

## 1. Open the wizard

Sidebar → **Experiences** → **New Experience** → **AI Experience**.

## 2. Basics

| Field | What to put |
|---|---|
| **Name** | Display name. *"Fashion Assistant"*. |
| **Slug** | URL path. Auto-generated. **Can't be changed later.** |
| **Description** | **Write this carefully.** Interakt uses it to draft the AI's system instructions in step 3. Describe what the chat is for, like a brief — *"Helps shoppers find fashion items, suggests outfits, answers product questions. Friendly, expert, never pushy."*. |
| **Pipeline mode** | **Agentic** for free-form conversational. **Deterministic** for predictable, structured chats. See [Pipeline modes](../concepts/pipeline-modes). |

Click **Next**.

## 3. Tools

Pick the tools this chat can use. For a "chat over our data" experience, you want all four tools that were auto-generated for your data source:

- **search** — full-text + vector query.
- **lookup** — fetch one record by ID.
- **inspect** — return the schema (the AI uses this to know what it *can* ask).
- **enumerate** — list distinct values of a facetable field (used when the AI needs to answer "what brands do you have").

Search-only is a degraded experience. The other three matter more than they look.

Skip this step (assign no tools) only if you want a pure-text chatbot that doesn't fetch any data.

Click **Next**.

## 4. AI configuration

| Field | What to put |
|---|---|
| **System instructions** | Pre-filled by AI from your description. **Read it.** Edit anything wrong or missing. This is the personality. |
| **Tone** | Professional / Friendly / Casual / Enthusiastic / Concise. Picks a base voice. |
| **AI provider / model** | Default = system default. Override for this experience if needed. |
| **Max context messages** | 20 is fine. Higher = more memory, more cost. |

Below the instructions there's a **Preview composed prompt** toggle. Click it to see what the AI actually receives when this chat runs — your instructions plus the tone plus the list of tools the AI can call. Worth a sanity read.

Click **Next**.

## 5. Access control

| Field | What to put |
|---|---|
| **Allowed origins** | **Add your production domain and your dev URL.** Without them, browser calls fail. |
| **Rate limit per minute** | 60 default. |
| **Rate limit per day** | Leave blank for unlimited, or set a cap. |

Click **Create**.

## 6. Activate

In the header of the detail page, click **Activate**. Inactive experiences exist but reject traffic.

## 7. Test in the Chat Playground

Expand the **Chat Playground** card on the detail page. Type a question.

Watch:

- Does it answer at all?
- Does it use the right tool? You can see tool calls in the sidebar.
- Is the tone right?
- Does it cite sources, follow your instructions?

Iterate:

1. Tweak instructions or tool descriptions.
2. Save.
3. Try the same question again.

## 8. (Optional) Add guardrails

Expand the **Guardrails** card. Enable input or output guardrails as needed:

- **Topic gating** keeps the chat on-domain. Add a few allowed-domain keywords and click **Generate Domain Terms** to expand them semantically.
- **Blocklist** for specific things that should never appear.

See [Configure guardrails](configure-guardrails) for the step-by-step.

## 9. Embed the chat on your site

Expand the **Chat Widget** card on the detail page.

1. Pick the **theme**.
2. Set **welcome message**, **welcome description**, **input placeholder**, and a few **suggested questions** (one-line questions users can click instead of typing).
3. Choose **launcher** style — Floating (default, a button in the corner) or Tab (a fixed sidebar tab).
4. Pick **placement** for the floating launcher.
5. Adjust colours, font, border radius to match your brand.
6. (Optional) Add your logo URL.
7. Click **Save** to persist.
8. Click **Copy** to grab the embed snippet.

Paste the snippet into your site's HTML.

See [Embed widgets](../concepts/embed-widgets) for every option.

## 10. Calling the chat API from a custom frontend

If you're not using the widget:

```
POST /api/v1/ai-experiences/<your-slug>/chat
Authorization: Bearer <your-token>
Content-Type: application/json
Accept: text/event-stream

{
  "message": "Find me a warm winter coat",
  "sessionId": "user-123-conv-456"
}
```

Response is a server-sent events stream. Your frontend renders it as it arrives. Keep the same `sessionId` across turns to maintain conversation history.

The detail page's **Access Token** card has a working curl example.

## Common gotchas

- **The chat answers generically and ignores your data.** Either no tools are assigned, or the tool descriptions are too vague. Check the Assigned Tools card and the AI-description override field.
- **The chat is too eager to call tools** ("for every question I get a database search"). The descriptions are too broad. Narrow the "when to use" guidance in the description.
- **The chat is too cautious.** Topic-gate guardrails are blocking too aggressively. Lower the threshold or expand the allowed-domains list.
- **The chat doesn't follow the system instructions.** Often the model is too small (Ollama 7B). Switch to OpenAI for production-quality instruction-following.
- **Sessions don't persist.** Your widget / app needs to keep the `sessionId` across turns. The widget handles this; custom frontends need to store and pass it.

## Where to go next

- [Pipeline modes](../concepts/pipeline-modes) — when to switch between Agentic and Deterministic.
- [Tools](../concepts/tools) — what each tool does and how to override descriptions.
- [Add tools to your chat](add-tools-to-your-chat) — custom HTTP and AI-responder tools.
- [MCP Connections](../concepts/mcp-connections) — attach a Model Context Protocol server and bring its whole tool catalog into a chat.
- [Configure guardrails](configure-guardrails) — keeping the chat on-topic.
- [Embed widgets](../concepts/embed-widgets) — the widget snippet.
