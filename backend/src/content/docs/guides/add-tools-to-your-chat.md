---
sidebar_position: 7
---

# Add tools to your chat

[Tools](../concepts/tools) are how a chat experience can go beyond chatting — search your data, look up records, call your APIs. This guide covers the two common cases: assigning auto-generated tools to a chat, and creating a custom HTTP tool from scratch.

## Before you start

- A [chat experience](create-a-chat-experience).
- (For data-source tools) a search index with data already loaded.
- (For HTTP tools) the upstream API's URL, auth requirements, request/response shape.

## Case 1: Assign auto-generated tools

When you upload data into a search index, Interakt creates a data source and four tools for it: **search**, **lookup**, **inspect**, **enumerate**. If those exist, you just need to assign them to the chat.

### Steps

1. Sidebar → **Experiences** → open your AI experience.
2. Expand the **Assigned Tools** card.
3. Click **Assign Tool**. A modal opens with a search box and the list of every tool in the system.
4. Tick the four tools for your data source: search, lookup, inspect, enumerate.
5. Click **Assign**.

The tools appear in the card with toggles and a per-tool description override.

### When to override the AI description

Each tool has a global description (used everywhere) and a per-experience override (used only by this chat). Override when:

- The chat needs a more specific framing of the tool. *"Searches the support knowledge base"* vs *"Searches the product catalog"* — same tool type, different framing.
- You want the AI to use the tool more aggressively (or more carefully) in this experience than elsewhere.
- The default description was generic.

Click the description override field, write your version, click outside to save. The change applies immediately to this chat only.

### When to disable a tool without removing it

The toggle on each row. Useful for:

- A/B testing — turn off `lookup` and see if the chat degrades.
- Maintenance — the upstream is down; toggle off so the chat stops trying.

Re-enable by toggling on again.

## Case 2: Create a custom HTTP tool

Use this to give the chat access to your own systems — order lookup, account check, inventory query, whatever has an HTTP API.

### Step 1 — Save the credential as a secret

Sidebar → **Platform → Secrets Vault** → **New Secret**.

- **Name** — `orders_api_key`.
- **Value** — paste your API key.
- **Description** — *"Bearer token for orders.example.com API."*

Save. You'll reference this from the tool config.

See [Secrets](../concepts/secrets) for details.

### Step 2 — Create the tool

Sidebar → **Capabilities → Tools** → **Create Tool**.

1. **Pick the executor type** — HTTP API.
2. **Basic info:**
   - Name: `lookup_order`.
   - Slug: auto-generated.
   - Description: a short summary.
3. **Configuration:**
   - **Method** — GET (for read), POST (for create / search).
   - **Base URL** — `https://orders.example.com`.
   - **Path template** — `/orders/{{input.order_id}}`. The `{{input.X}}` placeholders are filled in by the AI when it calls the tool.
   - **Headers** — `Authorization: Bearer {{secret:orders_api_key}}`.
   - **Body template** — for POST/PUT, with `{{input.X}}` placeholders. Skip for GET.
   - **Timeout** — 30 seconds is the default. Raise for slow upstreams.
   - **Retries** — default 0. Set to 1–2 for transient failures.
4. **Input schema** — JSON Schema describing what the AI needs to provide:
   ```json
   {
     "type": "object",
     "properties": {
       "order_id": {
         "type": "string",
         "description": "The order identifier, e.g. ORD-12345"
       }
     },
     "required": ["order_id"]
   }
   ```
5. **Output schema** *(optional)* — validates the response. Useful for catching upstream changes.
6. **AI description** — see [Description matters](#description-matters) below.

Click **Create**.

### Step 3 — Test the tool

On the tool's detail page, the **Test Tool** panel lets you call it with sample input. Try an order ID you know exists; confirm you get the expected response, that the secret resolved, that there's no timeout.

This is where you catch wiring problems before exposing the tool to a live chat.

### Step 4 — Assign to a chat experience

Same flow as Case 1 — open the experience, **Assigned Tools** card, **Assign Tool**, pick `lookup_order`, save.

### Step 5 — Test in the Chat Playground

Open the experience's **Chat Playground** card. Ask a question that should trigger the tool:

> *"Where's order ORD-12345?"*

Watch the sidebar:
- Does the AI pick `lookup_order`?
- Does it extract the right `order_id`?
- Does the tool return data?
- Does the AI use the data in its response?

If the tool isn't called when it should be, the [description](#description-matters) needs work.

## Description matters

The AI picks tools based on their descriptions. A bad description means the tool gets ignored or overused for everything.

### The template

```
[What the tool does, in one sentence.]
[When to use it: 1–3 specific triggers.]
[When not to use it: 1–2 anti-triggers.]
[Example: a sample input and what it returns.]
```

### A bad description

> Looks up orders.

### A good description

> Looks up an order's status, items, and shipping by order ID. Use when the user asks about a specific order they have (order number, "where's my order", "did my order ship", "what was in my order").
> Don't use for general product questions, returns, or customer-service inquiries — those have their own tools.
> Example input: `{ "order_id": "ORD-12345" }`. Returns status, items, shipping carrier.

## Iterating

In the experience's playground, watch where the AI goes wrong:

- **Wrong tool picked.** Tighten both tools' descriptions to be less ambiguous.
- **No tool picked when one should be.** Make the description more inviting — add more "when to use" triggers.
- **Wrong parameter extracted.** Tighten the input schema — mark fields required, add clear descriptions on each property.
- **Tool fires but response makes no sense.** Add an output schema or shape the response in the executor (truncate, summarise). Big or messy responses confuse the AI.
- **HTTP timeouts.** Raise the tool's timeout. For really slow upstreams, switch to an async pattern (return a job ID, have the AI say "I'll check back").

## AI Responder tools

The same flow applies to AI Responder tools (sub-AI calls with their own instructions). See [Tools](../concepts/tools) for the configuration shape.

## Bringing in MCP server tools

MCP servers aren't tools — they're **Connections** that expose many tools at once. Set up the connection once in **Capabilities → MCP Connections**, then attach it to any chat experience from that experience's detail page. See [MCP Connections](../concepts/mcp-connections) for the full flow.

## Common gotchas

- **Tool not called when it obviously should be.** 99% of the time the description. Rewrite it.
- **`{{input.X}}` resolving to empty.** The AI didn't fill X. Add it as required in the input schema with a clear description.
- **`{{secret:X}}` resolving to empty.** Typo in the name, or the secret doesn't exist. Check the Secrets list.
- **HTTP 4xx from the upstream.** Header / body shape wrong. Test with the in-page Test Tool panel before involving the AI.
- **Big response confuses the AI.** Add an output schema, or shape the response (truncate, pick fields, summarise) inside the executor.

## Where to go next

- [Tools](../concepts/tools) — concept page.
- [Secrets](../concepts/secrets) — storing tool credentials.
- [Configure guardrails](configure-guardrails) — limiting what the chat can say with tool data.
- [Prompt templates](../concepts/prompts) — tuning the prompts that decide which tool runs.
