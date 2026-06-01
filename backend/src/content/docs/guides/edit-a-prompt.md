---
sidebar_position: 9
---

# Edit a prompt template

When the AI in a chat experience does the wrong thing in a consistent way — wrong tone, ignores certain questions, leaves out citations — the fix is often a change to a prompt template. This guide walks through finding the right template, creating a new version, and rolling it out safely.

The concept page on [Prompt templates](../concepts/prompts) covers what each template does and what the pipeline looks like.

## Before you start

- You've seen a behavioural issue in [Analytics → Conversations / Traces](../concepts/analytics) or in a Chat Playground.
- You know which pipeline step the issue is in.

## 1. Identify which template to edit

Open the trace for a problematic conversation in **Analytics → Traces**. Each step in the timeline is a separate template:

| Symptom | Likely template |
|---|---|
| The AI calls the wrong tool (or no tool at all) | **Turn Planner** |
| The AI calls the right tool but extracts wrong parameters | **Param Extraction** |
| The AI has the right data but writes a bad answer | **Response Synthesis** |
| The AI doesn't cite sources or misformats responses | **Response Synthesis** |
| Greetings get a long pipeline run instead of a quick hi | **Response Synthesis Lightweight** |
| Agentic chat keeps looping unnecessarily | **Turn Planner (Agentic)** or **Agentic Loop** |

If the chat experience is in **Deterministic mode**, focus on the deterministic-mode templates. If **Agentic**, focus on the agentic-mode ones. Switching modes uses a different set of templates entirely.

## 2. Open the template

Sidebar → **Capabilities → Prompt Templates**.

The list is grouped by pipeline step. Find the step you identified and click the current default version (the one marked "System Default").

## 3. Read the current template

The detail page shows the full prompt with syntax highlighting:

- Blue — `{{variables}}` filled in at runtime.
- Amber — `<!-- section:name -->` editable sections.
- Grey — `{{#if conditional}}` blocks.

Read the whole thing. Notice:

- What variables it has access to. If you want the AI to use a piece of information it isn't using, check that the relevant variable is in the prompt.
- The structure — instructions, examples, output format guidance.
- Where in the flow this prompt sits (the side panel describes its role).

## 4. Decide what to change

Common small changes:

- **Tone.** Add or modify the "be friendly", "be terse", "use plain English" line.
- **Add a rule.** *"If you don't have data to support the answer, say so. Don't speculate."*
- **Require citations.** *"Whenever you reference a product, include the product name and SKU."*
- **Restrict topics.** *"You only answer questions about <domain>. For other topics, politely redirect."*
- **Format the output.** *"Use bullet points for product lists. Use markdown for emphasis."*

Common bigger changes (do these carefully):

- Reordering sections.
- Adding new examples to demonstrate desired behaviour.
- Removing language that the AI is over-following.

Avoid:

- Removing variables (`{{search_results}}`, `{{tool_list}}`, etc.). The AI relies on these to know what's available.
- Rewriting the whole template from scratch unless you really know what you're doing.

## 5. Create a new version

Copy the prompt content into a text editor or directly into a new-version dialog (the UI varies). Make your edits. Save the new version.

The new version goes into "Draft" status. The current system default keeps running.

## 6. Test the new version

This is the important step. There are two paths.

### A — Test on a separate chat experience first

Create a copy of your chat experience (or use a development one). Promote the new template to the system default *for that chat only* by ensuring it's the default while the other chat is paused — or rely on the version model where the new draft becomes the system default for the whole system.

This is admittedly clunky in the current UI; per-experience pinning is on the roadmap.

### B — Make it the system default and watch closely

If you have a low-traffic instance or you're outside business hours:

1. On the new version, click **Make this the system default** (the rollback button on the new version).
2. Run a battery of test messages through the affected chat experience in the Chat Playground.
3. Watch the next handful of real conversations in **Analytics → Traces**.

The change applies immediately to all chat experiences using this pipeline step. If a regression appears, immediately roll back (next step).

## 7. Roll back if needed

Open the prompt template detail page → Version History card. On any previous version, click **Make this the system default** to restore it. Instant — the next conversation uses the rolled-back version.

You can roll forward again later if you decide the issue was elsewhere.

## A note on model size

Smaller models follow long prompts worse. A nuanced prompt that works on `gpt-4o` may be ignored by a 7B local model. If you're targeting Ollama / local models, keep prompts shorter and more directive. If you're on OpenAI cloud, you can be more elaborate.

## Common gotchas

- **Promoting before testing.** Always run a few test messages in the Chat Playground before promoting.
- **Forgetting that prompts apply system-wide.** A change to "Response Synthesis" affects every chat experience using the deterministic mode. There's no per-experience pinning yet.
- **Removing required variables.** If `{{search_results}}` is no longer in the prompt, the AI has no idea what tools returned. Don't strip variables you don't understand.
- **Adding instructions that should live on the chat experience.** "Always be friendly" works in the experience's system instructions and is easier to manage there. Only change templates for things that need to be in the pipeline's wiring.
- **Tuning while the user is talking to it.** Promote → test → if bad, rollback. Don't sit on a broken prompt template hoping you'll get it right "soon."

## Where to go next

- [Prompt templates](../concepts/prompts) — concept page.
- [Pipeline modes](../concepts/pipeline-modes) — which prompts run when.
- [Analytics → Conversations / Traces](../concepts/analytics) — diagnose which step is off.
