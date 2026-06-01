---
sidebar_position: 2
---

# Dashboard

The landing page when you log in. It's an orientation screen — shortcuts to the things you do most, a snapshot of recent activity, and a quick health check.

## Where to find it
Sidebar → **Dashboard**.

## What's on the screen

### Hero — welcome and quick stats
The header greets you and shows a couple of headline numbers from the last 24 hours — total queries served, average response time. These come from Analytics; they're zero if no traffic has hit your experiences yet.

### Quick actions
A grid of buttons for the things you'll do most often:

- **Create new experience** — search or AI/chat.
- **Create new data source** — connect a search index, file store, or database.
- **View analytics** — jump to the Overview dashboard.
- **Run playground query** — open the search or AI playground.
- **Configure AI provider** — settings → AI providers.

These shortcut buttons go to the same pages you can reach from the sidebar — they're here so you don't have to dig through the menu the first few times.

### Recent activity feed
A timeline of what's happened recently in the admin: who created which experience, which tools got added, which experiments ran. Useful when there are multiple admins on the same instance — you can see what someone else changed.

### System health
A summary of the moving parts:

- **AI providers** — enabled providers and their last-checked status. Green if reachable, red if not.
- **Data sources** — number of data sources and whether their health checks pass.
- **Cache** — basic cache stats (entries, size).

If something here is red, click into it — the page for that resource will show the actual error.

### Analytics summary widgets
Three quick rolling numbers:

- **Total queries** in the last 24 hours.
- **Average response time** in the last 24 hours.
- **Quality score trend** — how relevant the results were, by Interakt's internal scoring.

Click any of them to jump to the Analytics overview for the details.

## What this screen is for

- **Orienting yourself when you first log in.**
- **Spotting that something's broken** without having to remember which page shows what.
- **Skipping ahead** to a common task with one click instead of two.

It's not where you go to fix anything — clicking through to the actual resource is. Think of it as the lobby.
