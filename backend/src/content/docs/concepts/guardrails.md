---
sidebar_position: 23
---

# Guardrails

**Guardrails** are rules that filter what goes in (user messages) and what comes out (model responses) of an AI/chat experience. They keep the chatbot on-topic, prevent it from leaking sensitive content, and stop it from being used for things you don't want.

Guardrails are configured per chat experience. Both **input** (the user's message, before the model sees it) and **output** (the model's response, before the user sees it) can be guarded.

## Where to find this screen
Sidebar → **Experiences** → your experience → **Edit** → **3. Guardrails**.

(There is no separate global Guardrails section — each chat experience has its own.)

Changes here save as you make them. They do not wait for the **Save Changes** button at the
bottom of the page.

## What the screen does

Three parts: a **lock**, then **Incoming messages** and **Outgoing replies**, which have the
same shape. Each side has an enable toggle. When enabled, you configure:

- **Topic gating** — keep the chat on-domain.
- **Blocklist** — phrases or keywords that should never appear.

A small flow diagram visualises how an incoming message moves through the gates.

## Lock these rules on

The switch at the top of the section — **Lock these rules on** — makes the configured rules run
on every turn whether or not a side below is switched on.

Use it when the checks are a requirement rather than a preference. It is the only setting in
Interakt that can promise a reviewer *"these checks cannot be turned off on this experience"*.

When it is on, each side with rules configured shows an **Enforced** badge and its toggle is
disabled — there is no off position to click, because switching it off would not switch
anything off. To genuinely disable a side, turn the lock off first.

A locked side with **no rules** is not enforced, because rules that do not exist cannot run.
The screen flags that case rather than letting it pass as protection.

This used to be part of the pipeline mode: the *Governed* preset forced guardrails on. That put
a compliance decision inside a performance setting, and left the guardrail toggle reading "off"
while the rules ran. The lock is independent of the [turn budget](pipeline-modes) now, so any
combination works.

## Topic gating

Stops the chat from being used for off-topic conversations. Useful when your chatbot is, say, a product-finder and you don't want it answering medical questions or doing your customer's homework.

### Configuration
- **Domain filter enabled** — toggle.
- **Allowed domains** — keywords describing what's on-topic. *"fashion, ecommerce, shipping, returns"*. Free-text, comma-separated.
- **Friendly message** — what the chatbot says when the user goes off-topic. *"I can only help with fashion shopping. Can I help you find something else?"*
- **Match threshold** — how close a message must be to your domain terms to count as on-topic. Higher is stricter (more rejections); lower is more lenient. The default of `0.30` is a reasonable starting point — tune it from real behavior rather than guessing. Every turn records the similarity it measured, under **Analytics → Traces**, so you can see how close your near-misses actually were.
- **Generate Domain Terms** button — uses AI to expand your keywords into 20–30 semantically related terms. *"fashion"* expands to *"clothing, apparel, garments, accessories, style, outfits…"*. The expanded list is what's actually used at match time — your keywords are the seed.

### Status indicators
- **Generated** — the expanded term list is current.
- **Stale** — you changed the keywords but haven't re-generated.
- **Not Generated** — the expanded list doesn't exist yet.

If the status is stale, click **Generate Domain Terms** again. Off-topic messages get the friendly message; the model never runs.

## Blocklist

Hard list of phrases or words to filter on. Different from topic gating in that it's exact-match (or substring-match), not semantic.

### Configuration
- **Blocked terms** — comma-separated. *"competitor1, competitor2, password, suicide"*.
- **Action** — what to do when a blocked term is detected:
  - **Block** — reject the message entirely; the chat replies with the friendly fallback.
  - **Warn** — log the match but let it through.
  - **Redact** — replace the matched text with `[REDACTED]` and continue.

### When to use blocklist vs topic gate

- **Blocklist** for known-bad strings: profanity, competitor names, sensitive terms.
- **Topic gate** for what the chat is *about*: scope, not strings.

You typically use both.

## Input vs output guardrails

| | Input | Output |
|---|---|---|
| **Runs on** | The user's message. | The model's response. |
| **Purpose** | Stop bad inputs before they reach the model. | Stop bad outputs before they reach the user. |
| **Cost** | Adds latency before the model call. Keep lean. | Adds latency after the model call. User already waiting; less noticeable. |
| **Use for** | Topic gating, prompt injection blocks, profanity filtering. | PII leak prevention, hallucination caps, brand voice enforcement. |

A typical configuration:

**Input:**
- Topic gate enabled with the chat's domain.
- Blocklist for the most obvious off-topic / abusive terms.

**Output:**
- Blocklist for things the chat should never say (competitor names, deprecated product SKUs, internal codenames).

## How they fit into the pipeline

The flow diagram in the Guardrails section shows the order:

1. **Blocklist** — runs first; cheap exact-match.
2. **Greeting detect** — special-cases greetings ("hi", "thanks") so they don't get rejected by topic gating.
3. **Domain filter** — runs only if not a greeting; semantic check against allowed domains.
4. **Pipeline routing** — if all gates pass, the message goes to the AI pipeline.

If any gate blocks, the friendly message is returned without invoking the AI. This is also why guardrails reduce cost — blocked messages don't pay for an LLM call.

## Testing your guardrails

The best test is the **Chat Playground** card on the experience detail page. Try:

- **In-domain messages** — should pass and get real answers.
- **Off-topic messages** — should hit the topic gate and get the friendly message.
- **Edge cases** — questions that are tangentially related. Tune the threshold until these resolve the way you want.
- **Greetings** — should pass through (the greeting detection should handle them).

If your guardrails are too aggressive, lower the threshold or expand the allowed-domains list. If too loose, raise the threshold.

## The Help Assistant — guardrails disabled

The built-in Help Assistant (the one in the ? icon → Ask tab) has guardrails **disabled** by design. The whole point of it is to answer freely about Interakt. If you replicate the Help Assistant for your own internal documentation, you'll probably want it the same way.

## Common gotchas

- **Topic gate too narrow.** "Only allow product questions" blocks "do you have any sales going on?" Make sure your allowed-domains list is broad enough, or generate the expanded terms to catch related vocabulary.
- **Forgetting to regenerate after changing keywords.** Stale status means the chat is still using the old expansion. Click **Generate Domain Terms** after edits.
- **Threshold too strict.** Set the threshold at the default and only adjust based on real behavior. Cranking to 0.95 blocks half of genuine queries.
- **No friendly message set.** Defaults to a generic "I can't help with that" — customize it. Users are much more forgiving of a polite redirect.
- **Forgetting output guardrails.** All your filtering is on input — the model can still output bad things on its own. Mirror critical filters on the output side.

## Where to go next

- [Chat experiences](chat-experiences) — where guardrails live.
- [Prompt templates](prompts) — the prompts can also enforce constraints from inside the model.
- [Analytics → Conversations / Traces](analytics) — see which messages were blocked and what they looked like.
