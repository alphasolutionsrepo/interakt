---
sidebar_position: 12
---

# Turn budget and limits

Every chat experience runs the same pipeline. What differs between experiences is how much a
single turn is allowed to spend before it gives up.

> **Changed recently.** Interakt used to ship two chat engines — a *Deterministic* pipeline and
> a separate *Agentic* one — and picking between them was the first question the creation
> wizard asked. There is one engine now. The old choice survives as a pair of budget presets,
> and everything it used to imply about guardrails moved to [Guardrails](guardrails).

## Where to find it

Sidebar → **Experiences** → your experience → **Edit** → **Advanced** → **Turn budget**.

It is under Advanced deliberately: the defaults are sensible, and most experiences never need
it changed. New experiences start on **Standard**.

## What a turn spends

A turn spends one model call to plan, one per action to work out that action's arguments, and
one to write the answer. The panel states the worst case for the limits you have set:

| Preset | Planning rounds | Tool calls | Worst-case model calls |
|---|---|---|---|
| **Standard** | 1 | 3 | 5 |
| **Thorough** | 3 | 8 | 12 |

Most turns use far fewer — a typical question resolves in a single tool call. The ceiling
exists so a bad prompt or a confused planner cannot run up an unbounded bill.

Token cost depends on your model and how much your tools return, so the panel does not guess
at it. **Analytics → Overview** reports what was actually spent.

## The two presets

**Standard** answers from a single attempt. If the search comes back empty, it says so and
tells you what it could not match, rather than trying again.

**Thorough** re-plans when an attempt returns nothing usable — up to two further attempts. Each
one is recorded in the trace.

The honest summary is that they behave identically on most turns. They diverge only when the
first attempt fails: Thorough tries again, and pays for it. On a question with no good answer
in the index, expect roughly three times the tokens for the same conclusion. Choose Thorough
when your data is messy or your users ask vague questions, and Standard otherwise.

## The individual limits

Selecting a preset fills these in; changing any one of them marks the experience **Custom**.
An override is a delta — the limits you leave alone keep tracking the preset.

| Limit | What it does |
|---|---|
| **Planning rounds** | How many times the planner may run. 1 means the plan cannot be revised. |
| **Tool calls per turn** | Hard ceiling across every attempt, not per attempt. |
| **Turn timeout** | Seconds before the turn gives up. |
| **Persona instructions when planning** | Off by default. Persona text governs voice, and is used when writing the answer rather than when choosing tools. Turn it on if your instructions also say *which* tools to use and when. |

Under **Prompt size** there are two more, and they are the ones that cost on every turn whether
or not anything goes wrong:

| Limit | What it does |
|---|---|
| **Schema fields shown to the planner** | How many fields per data source are described in the planning prompt, ranked by usefulness. Raise it when the planner misses fields it needed; lower it to spend less. |
| **Example values per field** | Real values observed in your index, so a filter matches instead of near-missing. |

## What this does *not* control

Guardrails. They used to be tied to the mode — the governed preset forced them on — which meant
a compliance decision was buried in a budget setting, and the guardrail switch could read "off"
while the rules ran.

Enforcement now lives with the rules, in [Guardrails](guardrails) → **Lock these rules on**. It
is independent of the budget, so any combination is available: a Thorough experience can be
locked, and a Standard one need not be.

## Common mistakes

- **Raising the tool ceiling to fix a bad answer.** If the planner is choosing the wrong tool,
  more calls will not help. Look at [Prompts](prompts) and your tool descriptions instead.
- **Setting planning rounds high.** Each round is a full plan-and-execute pass. Beyond three
  you are usually paying to confirm an answer you already had.
- **Setting the schema field budget to 0 without meaning to.** That stops the planner being told
  anything about your data, and it will fall back to guessing field names.

## Related

- [Guardrails](guardrails) — what the assistant is not allowed to do, and how to lock it.
- [Prompts](prompts) — how the planner decides, which is a bigger lever than any limit here.
- [Chat experiences](chat-experiences) — everything else on the experience.
- [Analytics](analytics) — what turns actually cost.
