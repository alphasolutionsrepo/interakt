---
sidebar_position: 15
---

# Prompt templates

A **prompt template** is the AI's instructions for one step of a chat conversation. Interakt ships with a working set for every step — you don't have to write any. But you'll often want to *tune* them: change the tone of an answer, add a rule about how to cite sources, fix an edge case where the chatbot does the wrong thing.

This is where prompt engineering lives in Interakt. Every change is versioned, every version is reviewable, and you can roll back if a change makes things worse.

## Where to find these screens
Sidebar → **Capabilities → Prompt Templates**.

## The list screen

Templates are grouped by the **pipeline step** they belong to. Inside each group, you see the versions of that template — usually a "v1" that's the system default, plus any versions you've created.

The six groups correspond to the steps in the chat pipeline:

| Step | When it runs | What its prompt does |
|---|---|---|
| **Turn Planner (Deterministic)** | First step of every deterministic turn. | Decides whether this turn needs tools or can just respond. |
| **Param Extraction** | After Turn Planner, if tools are needed. | Extracts structured parameters (search query, filters, IDs). |
| **Response Synthesis** | After tools have run. | Writes the answer from tool results. |
| **Response Synthesis Direct** | When no tools are called. | Handles direct clarifications. |
| **Response Synthesis Lightweight** | For greetings, off-topic messages. | Quick, short responses without invoking the full pipeline. |
| **Turn Planner (Agentic)** + **Agentic Loop** | In agentic mode. | Decides what to do iteratively. |

You don't have to know what each step does in detail to use Interakt — the defaults work. You only come here when you want to tune behaviour.

### Toolbar
- **Search input** — search by template name or content.
- **Step filter dropdown** — narrow to one pipeline step.
- **Refresh** button.

### Inside each step group
- The default template (system-shipped, marked "System Default") at the top.
- Any versions you or your team have created, below.
- Click a row to open the detail page.

## The detail page

The header shows:
- Template name and version.
- Step badge (colour-coded — Planning, Execution, Synthesis, Safety…).
- Status badge — Active / Draft / Archived.
- "System Default" badge if this is the shipped one.

### Prompt content card *(big, on the left)*
The full prompt text with syntax highlighting:

- `{{variable_name}}` — blue background. These get filled in at runtime with values from the conversation.
- `<!-- section:name -->` — amber background. Editable sections of the template that you can override per chat experience.
- `{{#if condition}}` — grey background. Conditionals that change what part of the prompt runs depending on context.

A **Copy** button copies the entire prompt as plain text.

### Variables card *(right column, collapsible)*
Every `{{variable}}` the prompt uses, with its description and source:

- **pipeline_context** — values from the current conversation (user message, history).
- **experience_config** — values from the chat experience's configuration (system instructions, tone).
- **tool_schema** — descriptions and shapes of the tools available to this turn.
- **action_results** — results from tools called earlier in the same turn.

This tells you what data the prompt has access to. If you want to add new behaviour, you usually work with the variables already provided rather than asking for new ones.

### Editable sections card *(right column, collapsible)*
The named sections of the template that can be overridden by individual chat experiences. Each section has an ID, a label, and an "Editable" indicator. This is how per-experience tuning works without forking the whole template.

### Version history card *(right column, collapsible)*
Every version of this template:

- Version number.
- Whether it's the system default.
- Whether it's the version you're currently viewing.
- A short description and a date.
- A **rollback** button next to each version — *"Make this the system default"*.

You can also click any version to view it. The system default is the one chat experiences use unless they've been pinned to a specific version.

## Editing a prompt

Prompts are pure text — the editing workflow is:

1. View the current default in the detail page.
2. Decide what you want to change.
3. Create a new version with your edits.
4. Test it on a low-traffic chat experience.
5. If it's better, make it the system default. If it's worse, leave the default alone — your draft version is still there for next time.
6. If you make it default and *then* discover it's worse, rollback to the previous version with one click.

You don't get a destructive edit. Every version is saved forever; rollback is non-destructive.

### What to change

A few common cases:

- **The chatbot is too formal / too casual.** Edit the synthesis prompt's tone instructions.
- **The chatbot makes up facts.** Add a "If you don't have data to support the answer, say so and don't speculate" rule.
- **The chatbot doesn't cite sources.** Edit the synthesis prompt to require citations.
- **The chatbot calls the wrong tool.** Edit the Turn Planner or Param Extraction prompt to add disambiguation rules.
- **The chatbot won't answer obviously-fine questions.** The Turn Planner is being too strict — relax it.

### What not to do

- **Don't rewrite a template from scratch unless you have to.** The shipped templates are tested with many models. A full rewrite often breaks things on models you haven't tested.
- **Don't remove variables.** If `{{search_results}}` is in the synthesis prompt, removing it means the AI won't see search results when synthesising. Things break.
- **Don't add instructions to every template.** If you want "always end with a smiley face", put it in the chat experience's system instructions, not the prompt templates. Templates are shared across experiences; instructions you want everywhere should be where they're naturally per-experience.

## Versioning model

Each step has *one active* template at a time — the system default for that step. New versions go to "Draft" until you promote them. The detail page's version history shows the full lineage.

Per-experience pinning isn't exposed in the UI yet — every experience uses the current system default for each step. If you need different prompts for different experiences, use:

- The experience's system instructions (most flexible, doesn't require touching templates).
- The per-experience tool description overrides.
- Different chat experiences with different system defaults — though you'd have to switch the global default between traffic-splitting experiments.

## Editable sections (advanced)

Some shipped templates have **editable sections** marked with `<!-- section:name -->` blocks. These are designed to be overridden by individual chat experiences without forking the whole template. The infrastructure exists but the per-experience override UI is not yet exposed — for now, sections are documentation of *intended* customisation points; you customise them by creating new versions of the whole template.

## Common gotchas

- **Promoting a template before testing it.** Always test on a non-production experience first.
- **Forgetting that smaller models follow long prompts worse.** A great prompt on `gpt-4o` may be ignored by a 7B local model. Tune per model class.
- **Adding contradicting instructions.** "Be terse" and "explain step by step" in the same prompt cancel out. Read your edits back as if you were the model.
- **Removing required variables.** If the AI doesn't know what tools are available, it can't call them. Don't strip `{{tools}}` from a Turn Planner prompt unless you really mean to.
- **Treating templates like code.** They're prompts in natural language. Don't over-engineer. Clear, simple, declarative.

## Where to go next

- [Pipeline modes](pipeline-modes) — which prompts run, in what order.
- [Chat experiences](chat-experiences) — where the templates get used.
- [Tools](tools) — the tools the prompts learn to call.
- [Analytics → Conversations / Traces](analytics) — see the prompts running on real conversations.
