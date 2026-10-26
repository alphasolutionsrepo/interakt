---
sidebar_position: 2
---

# Dashboard

The landing page when you log in. It answers three questions at a glance: how your experiences did this week, what needs you now, and what's worth knowing about your data.

## Where to find it
Sidebar → **Dashboard**.

## What's on the screen

### This week's figures
A line across the top shows the last 7 days for all experiences, each with a small trend and how it moved since the 7 days before:

- **Conversation turns** — questions your chat experiences answered.
- **Searches** — searches across all search experiences.
- **Found results** — the share of searches that returned something.
- **Failed turns** — chat turns that errored or didn't finish.

When a figure is based on only a handful of events, it says so ("Based on 13 events"), so a big percentage change on a tiny sample doesn't read as a trend. Click a figure to open it in Analytics. **Updated … ago** says how fresh the figures are.

On the right, **Live** counts chat turns and searches in the last 5 minutes, and the health line shows the latest health check of the database, search engine and AI providers ("All systems healthy", or how many services have problems). It links to **Monitor → Health Monitoring**. The check runs in the background every 10 minutes, so the page doesn't wait for it.

### Get started
On a new installation, a checklist walks you through setup: connect an AI provider, add your content to a search index, create an experience, put it on your site with the widget, and ask your first question. Steps tick themselves off as you do them, and the list disappears once all are done. **×** hides it sooner.

### Ask
Type a question about your data — "What needs attention right now?", "Which experience is doing worst?" — and the answer opens in a panel on the right. It's the same Ask chat as in Analytics, with the same history (the clock icon), and it uses the last 7 days unless your question names another period. For questions about how to use Interakt, use the **?** in the top bar instead.

### Needs you
Under the Ask box, chips list what's broken or waiting, with how many — a service that's down, failed conversation turns, searches that find nothing, indexes that need reindexing or have errors, failed background jobs. Each one opens the page where you fix it. When there's nothing, it says so.

### Cards
Short stories about your data, each with one way in:

- **Changes worth knowing** — for example, searches down sharply on the week before, or fewer searches finding results. These only appear when there's enough activity for the change to mean something.
- **Findings** — what the nightly insights refresh found (the same list as Analytics → Overview → What needs attention).
- **Tips** — things this installation could do better, based on its own data: an experience nobody has used this week, searches that keep finding nothing (synonyms usually help), content that hasn't been updated in over a month, relying on a single AI provider. Dismiss a tip with **×** and it won't come back, for any admin.

**Ask** on a card opens the Ask panel with a question about that card.

### Your experiences
Your busiest experiences, with a small day-by-day trend for the week, their activity, and anything wrong (for example "15% of turns failed"). Click a name to open the experience, or the chart icon for its analytics.

### Recently changed
What changed in the last 14 days: experiences created or edited, index settings changed, content indexed, and background jobs that ran or failed. Useful when several admins share an installation, or when something changed and you want to know what.

## Speed

The figures, chips and cards come from one request that the server keeps for a minute and refreshes in the background, so the page opens quickly. The Ask box is ready to type into straight away.
