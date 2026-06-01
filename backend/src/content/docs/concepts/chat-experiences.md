---
sidebar_position: 11
---

# Chat experiences

A **chat experience** (also called an AI experience) is a chatbot you can put in front of users. It has a personality you write, knows about your data through the **tools** it's given, follows the **prompt templates** in your library for each step of a conversation, and lives at a URL your site can embed.

## Where to find these screens
Sidebar → **Experiences** → filter to AI, or create from **New Experience → AI Experience**.

## Creating an AI experience

The create flow is a four-step wizard.

### Step 1 — Basics

| Field | What it controls |
|---|---|
| **Name** | Display name. |
| **Slug** | URL path. **Locked after creation.** |
| **Description** | Plain-language description of what this chat is for. **Interakt uses this to draft the AI's system instructions in step 3 — write it like a brief.** |
| **Pipeline mode** | Agentic or Deterministic. See [Pipeline modes](pipeline-modes). The two cards explain the trade-off; pick Agentic unless you have a specific reason. |

### Step 2 — Capabilities

Two sections, both optional, both editable later:

**Tools** — search a data source, look up a record, call an HTTP endpoint, run a sub-AI call. Checkbox per tool with its type chip (Data Source, HTTP, Web Search, AI Responder) and a 1-line description. For a typical "answer questions from our data" chatbot, pick the four auto-created tools for your data source: **search**, **lookup**, **inspect**, **enumerate**. See [Tools](tools).

**MCP Connections** — attach a Model Context Protocol server to bring all of its tools into this chat in one shot. One checkbox per connection, with the number of tools it exposes. See [MCP Connections](mcp-connections).

You can skip this step and assign capabilities later from the detail page.

### Step 3 — AI configuration

| Field | What it controls |
|---|---|
| **System instructions** | The free-text instructions the AI follows. Pre-filled with an AI-generated draft based on your description from step 1. **Read it.** It's the chatbot's personality. Edit freely — this is where you say "always cite the source product", "never guess prices", "respond in markdown", etc. |
| **Tone** | Professional, Friendly, Casual, Enthusiastic, Concise. Layered on top of the instructions. |
| **AI provider / model** | The model that runs the conversation. Default is the system default. Override if this chat needs something specific (e.g. a longer-context model for big knowledge bases). |
| **Max context messages** | How many of the previous chat turns the AI sees. Default 20. Lower = cheaper and faster, but the AI forgets earlier context sooner. |

Below the instructions field there's a **Preview composed prompt** toggle — it shows what the AI actually receives once your instructions, tone, and tool list have been combined. Useful for sanity-checking.

### Step 4 — Access control

| Field | What it controls |
|---|---|
| **Allowed origins** | CORS — domains allowed to call this chat from a browser. |
| **Rate limit — per minute** | Per-token + IP. Default 60. |
| **Rate limit — per day** | Optional cap. Leave blank for unlimited. |

Click **Create**. You land on the detail page.

## The detail page

Header has:
- Experience name, description.
- Type and status badges, pipeline mode chip.
- **Regenerate Token** button.
- **Activate** / **Deactivate** button.
- **Edit** button.

### Stats strip
- Tools assigned.
- Pipeline mode.
- Status.
- Created date.

### Chat Playground card

A working chat panel embedded right in the admin. Type messages, get streaming responses, see the tool calls, latencies, and token usage in a debug sidebar. **Use this constantly while you're tuning** — change instructions, save, test the same question in the playground, see whether it improved.

### Pipeline Steps card

Visualises the AI pipeline for this experience. For [Deterministic mode](pipeline-modes), four steps:

1. **Turn Planner** *(Planning)* — decides whether this turn needs tools.
2. **Parameter Extraction** *(Planning)* — extracts structured params for tool calls.
3. **Tool Execution** *(Execution)* — runs tools in configured order.
4. **Response Synthesis** *(Synthesis)* — writes the answer from tool results.

For [Agentic mode](pipeline-modes), three steps:

1. **Turn Planner (Agentic)** *(Planning)* — plans which tools to call.
2. **Agentic Loop** *(Execution)* — iteratively calls tools and synthesises.
3. **Response Synthesis** *(Synthesis)* — writes the final answer.

Each step shows its phase tag, a description, and any configurable options (max iterations, timeouts, synthesis style). The prompt template used for each step lives in [Prompt templates](prompts).

### Guardrails card

[See Guardrails](guardrails). The card has two main toggles — **Input guardrails** and **Output guardrails** — each with topic gating and a blocklist.

### Assigned Tools card

Lists the tools you picked in step 2 (or added later). Each row:

- Tool icon + name + operation.
- **Enabled** toggle — turn off without removing.
- **AI description override** — edit how this tool is described to the AI for *this* experience (without changing the tool's global description).
- **Remove** button.

The **Assign Tool** button at the top opens a modal to add more.

### AI Configuration card *(read-only)*

Mirrors step 3 of the wizard. Edit via the Edit page.

### Access Control card *(read-only)*

Allowed origins, rate limits.

### Chat Widget card

The embed configuration — see [Embed widgets](embed-widgets).

### Access Token card

The token (masked), a Copy button, a curl example. Regenerate Token is in the header.

### Danger zone
Delete button.

## The edit page

Same fields as the wizard, reorganised:

- **Basic information** — name, description, pipeline mode.
- **AI personality** — system instructions, tone, prompt preview.
- **AI provider & model** — provider/model selection.
- **Session management** — max context messages.
- **Access control** — origins, rate limits.
- **Observability** — telemetry detail level (Off / Metadata / Full).

Save with the button at the top.

## What makes one chat experience different from another

Two chat experiences over the same data can feel completely different based on:

- **Pipeline mode** — agentic feels conversational; deterministic feels structured.
- **System instructions** — "be playful and use emojis" vs "be formal and never speculate".
- **Tone** — small but real shift in voice.
- **Assigned tools** — what it can do.
- **AI description overrides on tools** — when it decides to use them.
- **Guardrails** — what it refuses to engage with.
- **Prompt templates** — the wording of each pipeline step (system-wide, but you can pin specific versions).

## Streaming and tool calls

Chat responses stream as the AI generates them. Your widget (or custom frontend) sees a sequence of events:

- `processing` — request received.
- `tool_call` / `tool_result` — when tools fire.
- `content` — response text, chunk by chunk.
- `sources` — citations / referenced records.
- `done` — end of stream.

The drop-in widget handles all this. If you're building a custom frontend, see [Access tokens](access-tokens) for the API model and try the Playground to see actual request/response shapes.

## Common gotchas

- **Forgot to assign tools.** A chat with no tools just chats — it can't fetch your data. Look at the **Tools** card.
- **Tool descriptions are vague.** The AI decides whether to call a tool based on its description. A tool called "search" described as "searches" will be ignored or called for everything. Override the description on the experience to say *what* it searches and *when* the AI should use it.
- **Picking a model that's too small.** Local 7B models on Ollama are fine for prototyping; for production-quality answers, OpenAI `gpt-4o` or `gpt-4o-mini` is the floor. Small models ignore instructions and invent facts.
- **No allowed origins set.** Browser-side calls fail with a CORS error until you add the site's origin.
- **The system instructions are too short.** A two-line system prompt produces a generic chatbot. Be specific: who is this chat for, what should it do, what should it never do, what's the tone, when should it cite sources, what's the fallback if it can't answer.
- **High max-context but small token budget.** If you set max-context to 100 messages but the model has an 8k token limit, each turn truncates. Match these.

## Where to go next

- [Pipeline modes](pipeline-modes) — agentic vs deterministic in detail.
- [Tools](tools) — the capabilities you give the chat.
- [Prompt templates](prompts) — the wording of each pipeline step.
- [Guardrails](guardrails) — keeping the chat on-topic and safe.
- [Embed widgets](embed-widgets) — putting the chat on your site.
- [Analytics → Conversations / Traces](analytics) — see every chat turn and where it went wrong.
