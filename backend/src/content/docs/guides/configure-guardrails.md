---
sidebar_position: 8
---

# Configure guardrails

[Guardrails](../concepts/guardrails) filter user inputs and AI outputs for a chat experience. This guide walks through setting up a starter configuration and tuning it.

## Before you start

- An [AI/chat experience](create-a-chat-experience) created.
- A clear idea of what's on-topic for this chat.

## 1. Open the guardrails card

Sidebar → **Experiences** → open your AI experience → expand the **Guardrails** card.

You'll see two sections — **Input guardrails** and **Output guardrails** — each with its own enable toggle.

## 2. Configure input guardrails

Input guardrails run on the user's message before the AI sees it. They prevent off-topic conversations and known-bad terms from reaching the AI.

### Step 1 — Turn on input guardrails

Toggle the **Input guardrails enabled** switch.

### Step 2 — Topic gating

Topic gating keeps the chat on-domain.

1. Toggle **Domain filter enabled**.
2. **Allowed domains** — enter a comma-separated list of keywords describing the chat's domain. For a fashion product chat:
   ```
   fashion, clothing, apparel, shoes, accessories, shipping, returns, sizing
   ```
3. **Friendly message** — what the chat says when it rejects an off-topic message:
   > *"I can only help with fashion shopping. Can I help you find something else, or have a question about an order?"*
4. **Threshold** — start at 0.6 (middle ground). Raise if off-topic gets through; lower if legitimate questions get rejected.
5. Click **Generate Domain Terms**. Interakt uses AI to expand your keywords into 20–30 semantically related terms. The expanded list is what the topic-gating logic uses — your keywords are the seed.

Verify the expansion looks right (under the **Expanded Terms** section). If it includes things you don't want covered, narrow your seed keywords and re-generate.

### Step 3 — Blocklist (optional)

Hard exact-match filter for known-bad strings.

1. **Blocked terms** — comma-separated list of phrases that should never appear in messages: competitor names, internal codenames, profanity.
2. **Action** — pick one:
   - **Block** — reject the message outright.
   - **Warn** — let it through but log a warning.
   - **Redact** — replace the matched text with `[REDACTED]` and continue.

For most customer-facing chats, **Block** is right for competitors and profanity.

## 3. Configure output guardrails

Output guardrails run on the AI's response before it goes to the user. They're the backstop — even if the AI generates something off-policy, this catches it.

Same structure as input. Common configuration:

1. Toggle **Output guardrails enabled**.
2. **Topic gating** — usually less aggressive than input. Use the same allowed-domains list, but a lower threshold (the AI is generally on-topic, so you're only catching outliers).
3. **Blocklist** — terms the AI should never say. Competitor mentions, deprecated SKUs, anything bad-for-brand.

## 4. Save

Click **Save** on the experience or whatever the save button is at the top of the page.

## 5. Test in the Chat Playground

Expand the **Chat Playground** card on the same experience detail page. Try a battery of test messages:

| Test message | Expected outcome |
|---|---|
| In-domain question (*"do you have red sneakers?"*) | Normal response. |
| Clear off-topic (*"help me write a poem"*) | Blocked. Friendly message shown. |
| Greeting (*"hi"*, *"thanks"*) | Should pass through (greeting detection handles it). |
| Edge case (*"do you have any sales going on?"*) | Should pass — sales is a fashion-shopping topic. If it gets blocked, broaden allowed domains or generate more terms. |
| Blocked term (*"is your product better than {competitor}?"*) | Blocked. |

The playground shows tool calls and rejections in the sidebar — you can see which rule fired.

## 6. Iterate

| Symptom | Fix |
|---|---|
| Off-topic messages get through | Raise the threshold, or expand the allowed-domains list and re-generate terms. |
| Legitimate questions get blocked | Lower the threshold, or expand allowed-domains. |
| Greeting got blocked | Should not happen — greeting detection runs first. If it does, the friendly message is too aggressive; review the topic-gating config. |
| Blocked term not caught | Check the blocklist for typos. The match is substring-based but case-insensitive. |
| Chat feels slow | Topic gating adds latency on every message. Skip output guardrails if input is sufficient. |

## 7. (Production) Disable in development

While iterating on the chat's persona and tools, you can toggle guardrails off so you can test rapidly. **Don't forget to re-enable before going live.**

## Special case — Help Assistant style

If you're building an internal documentation chatbot (an "ask anything about our system" assistant), turn **guardrails off entirely**. Topic gating defeats the purpose of an open-ended help bot. The built-in Help Assistant works this way.

## Common gotchas

- **Threshold too strict.** Default 0.6 is a starting point — most chats should sit between 0.5 and 0.7. Cranking to 0.9 blocks half of legitimate queries.
- **Generated terms list is stale.** If you change keywords without clicking Generate, the chat uses the old expansion. The status badge says "Stale" — fix by clicking Generate.
- **No friendly message set.** Defaults to a generic "I can't help with that." Always customise.
- **Forgetting output guardrails.** Input clean doesn't mean output clean — the AI can hallucinate things you don't want said. Mirror critical filters on output.
- **Blocklist for things topic-gate should catch.** "weather" doesn't need to be blocklisted in a fashion chat — topic-gating already rejects it. Use blocklist for *exact phrases* that need exact-match precision.

## Where to go next

- [Guardrails](../concepts/guardrails) — concept page.
- [Chat experiences](../concepts/chat-experiences) — where guardrails live.
- [Analytics → Conversations / Traces](../concepts/analytics) — see which messages got blocked, refine.
