---
sidebar_position: 20
---

# Analytics

**Analytics** answers questions like *"What did people search for last week?"*, *"Which searches found nothing?"*, *"Why did that conversation fail?"* and *"What is the AI costing us?"*. It's one area with a section per job, a filter bar they all share, and an **Ask** chat you can reach from every section.

## Where to find it
Sidebar → **Monitor → Analytics**. The sections are listed under it, and as tabs at the top of every analytics page:

- **Overview** — what needs attention, the Ask chat, and every experience side by side.
- **Search** — what people searched for, and how well search answered.
- **Conversations** — how the assistant handled conversations, and what people asked about (chat experiences).
- **AI & cost** — model calls, tokens, cost and tool usage (chat experiences).
- **Traces** — every chat turn, search and AI summary, step by step.
- **Settings** — when insights refresh, what is recorded, and clearing data.

## The filter bar

Every section answers for the same selection, shown in the header:

- **Experience** — one experience, or *All experiences*.
- **Period** — presets (Today, Yesterday, Last 24 hours, Last 7 / 30 / 90 days, This month, Last month) or **Custom range** with a calendar. Days start at midnight in *your* time zone, shown at the bottom of the picker.

The selection is kept in the page address, so a link you share opens the same view. **Updated … ago** next to the refresh button says how fresh the figures are; they also refresh on their own every minute.

## Overview

**What needs attention** lists findings from the nightly insights refresh — content gaps, failing searches, unusual cost, AI behaviour — for the stored window nearest your period (24 hours, 7 days or 30 days). Each finding has **Explain this**, which asks the Ask chat about it. **Hide for 7 days** removes a finding you're already handling, for every admin; hidden findings are listed underneath, with **Show again**.

**Ask** sits beside it. **Experiences** below compares every experience: volume, how many succeeded, how many searches found nothing, and average time. Click one to see its analytics.

## Search, Conversations, AI & cost

Each section starts with headline figures. Each figure shows how it moved since the same days just before ("↘ 42% vs prev."); hover it for the exact dates compared. Rates change in points, and an arrow is coloured only where one direction is clearly better.

Charts have a **Table** view with the same data. On **Search activity**, click a day or drag across several to pick them; **Show this day** narrows the page to it, and **Ask about this day** asks the chat.

On **Search**, totals count searches typed by visitors and searches the AI assistant made with its Search tool. **Popular searches** and **Failed searches** list only what visitors typed; **Assistant searches** lists what the assistant searched for, with how often each query found nothing. Lookups that Find Record, List Values and query understanding run aren't counted as searches, but **Latest searches** shows them, named by tool or step.

**Conversations** and part of **AI & cost** come from the nightly insights, so they show the stored window nearest your period, and say when they were computed.

## Ask (analytics chat)

Ask questions in plain English — *"Which searches most often find nothing?"*, *"How did search do this week compared with the week before?"*, *"Which conversations failed, and why?"*, *"How much did AI cost us?"*. Ask answers for the experience and period in the filter bar unless your question names another (*"on Oct 13"*, *"last week"*).

- **Where:** inline on the Overview, and the **Ask** button on every other section opens it in a panel. The Dashboard has an Ask box too.
- **Answers show their data:** each answer comes with cards of the figures it used and the period they cover. A figure in the answer that isn't in that data is flagged.
- **Follow-ups** keep the conversation's context, and suggested follow-ups appear under each answer. **Stop** ends an answer early; a stopped question isn't saved.
- **History** (the clock icon) lists earlier conversations. Search them by title, experience or anything said, and delete ones you don't need. History is shared by every admin.
- **Full screen:** the arrow icon opens the conversation on a page of its own.

For help using Interakt itself, use the **?** in the top bar instead.

## Traces

The lowest-level view: every chat turn, search request and AI summary, with what ran and how long it took.

The figures at the top count the turns in the list for your selection: how many errored, turn time (average, and the time 95% stay under), and background tasks that failed (memory and summaries after a turn). The list can be searched and filtered by status; select a turn to see its timeline — the planner, each tool call with its inputs and outputs, and the answer. A link with `?trace=<id>` opens one trace directly, whenever it happened.

Use it when a visitor reports a bad answer, a tool was called wrongly, or a step is slow.

## Settings

- **Insights** — when the nightly refresh runs (*Every day at 02:00 UTC* by default; change it in **Monitor → Background Jobs**), when it last ran, and **Refresh now**.
- **What analytics records** — which tracking is on, and the environment variable that sets each.
- **Analytics data** — **Clear all analytics data** (or one experience's), and **Clear only traces, for every experience**. Both are permanent.

## What feeds analytics

Search and chat are recorded automatically. Every search and chat turn is written to the trace store as it happens; the dashboards read it live, and the nightly insights refresh computes findings, intents, guardrail and cost summaries from it.

You can set the **observability level** per chat and search experience (Off / Metadata / Full) on the experience's edit page. Experiences start at Metadata: timings, counts and status, without query or message text. Off means no traces — only aggregate counts. Full captures everything.

## What about PII?

Traces may contain what visitors typed. If they type personal information into a chat, it's stored.

- Set the **observability level** to Metadata (no message text) or Off (no traces) per experience.
- **Settings → Analytics data** clears recorded data.
- Retention beyond that is configured at the database by the operator.

## Common gotchas

- **Findings or Conversations look old.** They come from the nightly refresh. Use **Refresh now** on the Overview or in Settings for fresh ones.
- **No data after a clean install.** Run the analytics warm-up from [Initial Setup](../getting-started/initial-setup), or wait for real traffic.
- **A trace shows an old prompt.** Traces are point-in-time — they show what the AI saw then, not the current prompt template.
- **My test chats don't show up.** Searches, chats and tool runs from an admin test chat, the playgrounds or a tool's Test panel aren't live traffic: they're left out of searches and insights. They still appear in **Traces**.
- **A day looks split oddly.** Days follow your browser's time zone; someone in another zone sees the same data grouped by their days.

## Where to go next

- [Chat experiences](chat-experiences) → Observability — controls what gets captured.
- [Prompt templates](prompts) — what to tune when a trace shows the AI doing the wrong thing.
- [Tools](tools) — what to fix when a trace shows the wrong tool being called.
- [Background jobs](background-jobs) — the nightly insights refresh.
