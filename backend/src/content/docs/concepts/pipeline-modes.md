---
sidebar_position: 12
---

# Pipeline modes

When you create an AI/chat experience, you pick a **pipeline mode** — *Deterministic* or *Agentic*. This is the single most consequential decision in the wizard. It controls how the chat thinks: how predictable, how flexible, how easy to debug, how expensive to run.

## Where to find it
Sidebar → **Experiences** → AI experience detail page → **Pipeline Steps** card (read-only) or **Edit → Basic information** (to change it).

The pipeline mode chip on the experience's detail header shows which one is in use.

## The two modes in plain English

### Deterministic — the structured pipeline

The chat follows a fixed sequence of steps every turn. The AI is used at specific points where language understanding is needed, but the *orchestration* — what runs, in what order, with what guardrails — is pre-defined.

The four steps:

1. **Turn Planner.** Looks at the user's message and decides: does this turn need tools, or can the AI just respond directly?
2. **Parameter Extraction.** If a tool is needed, the AI extracts the structured parameters (search query, filters, IDs).
3. **Tool Execution.** Tools run in a configured order. Returns data.
4. **Response Synthesis.** The AI writes the answer from the tool results.

Each step has its own [prompt template](prompts), each step's input and output are logged separately in [Conversations](analytics), and the order doesn't change between turns.

### Agentic — the AI decides

The AI is in charge. It sees the user's message and the list of tools available, and it decides what to do — call one tool, call several, skip tools entirely and respond directly.

The three steps:

1. **Turn Planner (Agentic).** Plans which tools to use.
2. **Agentic Loop.** Iteratively calls tools, reads results, decides whether to call more.
3. **Response Synthesis.** Writes the final answer.

The loop can iterate multiple times if the AI thinks more tool calls would help. There's a max-iterations cap so it doesn't run forever.

## Side-by-side

|  | **Deterministic** | **Agentic** |
|---|---|---|
| Who decides what runs | The pipeline | The AI |
| Predictability | High — every turn does the same things | Low — same question can take different paths |
| Debuggability | Each step logged separately, easy to trace | All decisions inside one model call, harder to debug |
| Latency | Often faster (small AI calls, no loop) | Slower (multiple iterations, larger context) |
| Cost (cloud models) | Cheaper per turn | More expensive (more iterations) |
| Best for | Customer-facing chat at scale, regulated/compliance-sensitive UIs, when you need consistent output shape | Internal tools, prototypes, open-ended Q&A, when you don't know in advance what users will ask |

## When to choose deterministic

- **You know what users ask.** "Find a product", "check an order status", "look up a policy" — three or four recurring intents.
- **You need consistent output.** Every answer should follow the same structure (e.g. product cards, then summary, then citation).
- **Compliance or audit matters.** Each step's prompt is fixed and versioned. You can show a regulator exactly what the chat does.
- **Cost is a concern at scale.** Deterministic uses fewer / smaller AI calls.
- **You want each step to be tunable independently.** Edit the prompt for parameter extraction without touching response synthesis.

## When to choose agentic

- **You don't know in advance** what users will ask. An internal knowledge-base assistant gets every kind of question.
- **The task naturally requires multiple steps.** "Find the cheapest red shoes that ship to my zip code by Friday" might need a search, a filter, a check, and a fallback — the AI can chain those itself.
- **You want flexibility over structure.** You're okay with the chat sometimes responding directly, sometimes calling one tool, sometimes calling three.
- **You're prototyping.** Agentic is faster to get something working. Move to deterministic when you've seen what real users ask.

## Switching modes

You can change the mode after creation. Open the experience → **Edit** → **Basic information** → toggle pipeline mode → **Save Changes**.

There's no migration to do. The pipeline switches over for the next conversation. Existing conversations finish in the old mode.

> **Heads up — the prompt templates are different per mode.** Deterministic uses Turn Planner, Param Extraction, Response Synthesis prompts. Agentic uses Turn Planner (Agentic), Agentic Loop, Response Synthesis prompts. Switching modes means switching which templates apply. If you customised one, you may need to re-customise the other set.

## Configurable options per step

### Deterministic — Turn Planner
Read-only in the UI. The prompt template controls behaviour. To tune, edit the template in [Prompt templates](prompts).

### Deterministic — Parameter Extraction
- **Extraction mode** (Strict / Lenient) — how literally the AI interprets ambiguous parameters.

### Deterministic — Tool Execution
- **Tool order** — drag-to-reorder. Affects which tool runs first.
- **Timeout per tool** — kills a slow tool call.

### Deterministic — Response Synthesis
- **Synthesis style** (Concise / Detailed / Natural).
- **Include tool reasoning** — show or hide the "I searched for X and found Y" trace in the response.

### Agentic — Agentic Loop
- **Max iterations** — how many times the loop can call tools (default 5). Higher = more chances to get a complex answer right, but slower.
- **Confidence threshold** — how confident the AI must be in its answer before exiting the loop.

## Watching the pipeline run

The **Chat Playground** card on the experience detail page shows tool calls and timings in real time as you test. For the full record across all users and all turns, go to **Analytics → Conversations / Traces**. The trace view shows each step as a row in a timeline — what its input was, how long it took, whether it succeeded — so you can see exactly where a bad turn went sideways.

## Common gotchas

- **Switching modes mid-tuning.** If you've spent time tuning prompts for one mode, switching mode means re-tuning the other set of templates. Pick deliberately.
- **Setting max-iterations too high.** Agentic with max-iterations = 20 can loop expensively if the AI keeps "trying one more search." 3–5 is usually enough.
- **Expecting deterministic to handle novel intents.** If the Turn Planner prompt doesn't anticipate an intent, the chat falls back awkwardly. Add the intent to the prompt template.
- **Expecting agentic to be cheap.** Each loop iteration is a full AI call. Five iterations = five times the cost of one.

## Where to go next

- [Chat experiences](chat-experiences) — the rest of the AI experience configuration.
- [Prompt templates](prompts) — the wording of each pipeline step.
- [Tools](tools) — the things the pipeline can call.
- [Analytics → Conversations / Traces](analytics) — see the pipeline running.
