---
sidebar_position: 20
---

# Analytics

The **Analytics** section answers questions like: *"What did people search for last week?"*, *"Which queries had no results?"*, *"How long did the chatbot take to respond on average?"*, *"What did the chatbot answer to a specific user?"*. Three sub-screens cover three angles.

## Where to find it
Sidebar → **Analytics**.

- **Overview** — dashboards: totals, trends, success rates, top queries.
- **Chat** — an AI assistant you can ask analytics questions in plain English.
- **Conversations / Traces** — the full record of every chat turn.

## Overview

Headline metrics and time-series charts for search and chat across your experiences.

### Where to find it
Sidebar → **Analytics → Overview**.

### Controls at the top

- **Experience selector** — narrow to one experience, or "all experiences" for the cross-experience view.
- **Time range selector** — Last 1h / 24h / 7d / 30d / 90d / custom range.
- **Processing status banner** — Interakt's analytics run on a background job; the banner shows when the last run completed and lets you trigger a manual run if you need fresh numbers.

### Trigger Processing button

Forces a fresh analytics run. The job aggregates raw query logs into the dashboards. Click this if you ran a batch of queries five minutes ago and the dashboard still shows the old numbers.

### Clear Analytics Data button

Destructive. Wipes analytics aggregates. Underlying raw logs in the traces remain. Use this when you want a clean slate for demos.

### Dashboards

When data exists, the page shows multiple rows of metrics.

**Top numbers:**
- Total searches.
- Successful searches (with %).
- Failed searches (with %).
- Average response time.

**Quality and engagement:**
- Quality score — Interakt's internal scoring of how relevant the top results were.
- Unique users.
- Average searches per user.

**Trends:**
- Trending queries chart — area chart over time, top queries by frequency.
- Query performance pie chart — success / failure / no-results.

**Comparison:**
- Experience comparison table — for each experience, total queries, quality score, response time, error rate.

**Recent searches feed:**
- The last N queries with timestamps, who searched (if known), what came back.

### Empty state

If no traffic has hit your experiences yet, the dashboards are mostly empty. Run the warm-up checkbox in [Initial Setup](../getting-started/initial-setup) to backfill the dashboards with synthetic traffic, or wait for real users.

## Chat (analytics assistant)

A chat interface where you can ask analytics questions in plain English. Interakt's own AI runs the analytics queries for you and renders the answer — sometimes as text, sometimes as embedded charts and tables.

### Where to find it
Sidebar → **Analytics → Chat**.

### How to use

Type a question. Examples:

- *"What were the top 10 searches yesterday?"*
- *"How many chats happened in the last hour?"*
- *"Which experience had the slowest response time this week?"*
- *"What were the most common failed queries last month?"*
- *"Compare quality scores across experiences."*

The assistant calls a set of analytics tools internally, fetches the data, and writes the answer. Tool calls are visible in the conversation — you can see what it queried.

### Sidebar
- **Chat history** — your previous conversations, clickable to resume.
- **New Chat** — start a fresh one.

### When to use

When you don't know which dashboard to look at. The chat figures out the relevant metric and shows it; you don't have to know the schema. Good for one-off questions you'd otherwise pull a junior analyst in for.

## Conversations / Traces

The lowest-level analytics view — every chat turn that ever happened, with the full trace.

### Where to find it
Sidebar → **Analytics → Traces**.

### Layout

Two-pane view.

#### Left pane — list of conversations

A table of every conversation, with:
- Conversation ID.
- User (if known).
- Tool call count.
- Total duration.
- Timestamp.
- Status (success / error / cancelled).

Filter controls:
- **Root only** toggle — show only top-level conversation entries, not individual tool calls.
- **Experience** filter.
- **Status** filter.
- **Time range** filter.

#### Right pane — turn detail (when one is selected)

A timeline of the conversation:
- The user's message at the top.
- Each pipeline step as a row — Turn Planner → Param Extraction → Tool Calls → Response Synthesis.
- For each step: duration, status, expanded view of inputs and outputs.

The trace shows what the AI saw, what tools were called, what they returned, and what the final response was. It's the most useful view for debugging "why did the chatbot say that?"

### When to use

- A user complained about a specific chat — find their conversation, replay it in the trace.
- The chatbot is hallucinating — see what it had in context when it made up the answer.
- A tool is being called wrong — see the parameters the AI extracted.
- Latency is high — see which step is slow.

### Span metrics at the top

A visual summary: total conversations, average duration, average tool calls per turn, error rate. Helps you spot trends before drilling into individual conversations.

### Actions

- **Refresh** — reload the list.
- **Clear All** — destructive; wipes the trace store. Use with care.

## What feeds analytics

Both search and chat are logged automatically with no extra setup. Every search query and every chat turn goes through a background pipeline that:

1. Writes the raw event to the trace store.
2. Aggregates it into the analytics dashboards on the next processing run.

You can configure the **observability level** per chat experience (Off / Metadata / Full) on the experience's edit page. Off means no traces — only aggregate counts. Full means everything is captured.

## What about PII?

Traces and analytics may contain user inputs (search queries, chat messages). If your users type personally identifying information into the chat, it'll be stored.

Mitigations:
- **Observability level** per experience can be set to Metadata (which strips message content) or Off (no traces at all).
- **Clear Analytics Data** wipes aggregates; **Clear All** on Traces wipes individual records.
- Database-level retention policies are outside the admin UI — for production, the operator should configure retention at the database layer.

## Common gotchas

- **Dashboards seem stale.** Click **Trigger Processing** in the Overview controls — the background job hasn't run yet.
- **No data after a clean install.** Run the analytics warm-up from [Initial Setup](../getting-started/initial-setup), or wait for real traffic.
- **Trace shows old prompt versions.** Traces are point-in-time — they show what the AI saw at the moment of the conversation, not what the current prompt template is. If you changed templates since, the trace won't reflect the change.
- **Looking for one specific user's conversation.** Filter by experience and time range, sort by timestamp; alternatively, search by conversation ID if your widget logs it.

## Where to go next

- [Chat experiences](chat-experiences) → Observability — controls what gets captured.
- [Prompt templates](prompts) — what to tune when a trace shows the AI doing the wrong thing.
- [Tools](tools) — what to fix when a trace shows the wrong tool being called.
