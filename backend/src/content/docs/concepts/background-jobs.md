---
sidebar_position: 22
---

# Background Jobs

The **Background Jobs** section runs long-running work outside the request/response cycle — things that take too long to do while someone waits, or that should happen on a recurring schedule. The first example is **Refresh AI insights**, which recomputes analytics insights (several model calls), but the system is general.

It's powered by a Postgres-backed queue, so there's no extra infrastructure to run — it uses the same database as everything else.

## Where to find it
Sidebar → **Platform → Background Jobs**.

## Key idea: job types vs. jobs

- A **job type** is a *kind* of background work plus the code that performs it (for example, "Refresh AI insights"). Job types are defined in code — they show up as cards at the top of the page.
- A **job** (or **run**) is a *single execution* of a job type, with a payload. You create jobs; you don't create job types from the UI.

> Think of the job type as a recipe and a job as one time you cook it.

## The page

### Job Types
One card per available job type. Each card shows:

- **Live counts** — how many jobs of this type are currently *active* (running) or *queued* (waiting).
- **Schedule** — the recurring schedule in plain English (e.g. "At 03:00 AM"), or "Not scheduled".
- **Run now** — queue one job immediately. A dialog lets you edit the JSON payload (pre-filled with a sensible example).
- **Schedule / Edit schedule** — create, change, or remove the recurring schedule (see below).

### Runs
A table of **every job in the system**, newest first. Filter by **job type** and by **state**. Each row shows the state, retry count, and timestamps; open a row's menu → **View details** to see the full payload and output (or the error, if it failed).

Row actions depend on state:

| State | Meaning | Available actions |
| --- | --- | --- |
| **Created / Queued** | waiting to run | Cancel, Delete |
| **Active** | running now | Cancel |
| **Retrying** | failed, will run again | Cancel, Delete |
| **Completed** | finished successfully | Retry, Delete |
| **Failed** | exhausted its retries | Retry, Delete |
| **Cancelled** | stopped before finishing | Resume, Retry, Delete |

Failed jobs are retried automatically according to the job type's retry policy before they land in **Failed**.

## Scheduling a job

Click **Schedule** on a job type's card. Pick a preset (Hourly, Daily, Weekly, Monthly) or type a **cron expression** — the dialog shows a live plain-English description so you can confirm it does what you expect.

A cron expression has five fields: `minute hour day-of-month month day-of-week`.

| Expression | Runs |
| --- | --- |
| `0 3 * * *` | every day at 03:00 |
| `0 * * * *` | every hour, on the hour |
| `*/15 * * * *` | every 15 minutes |
| `0 6 * * 1` | every Monday at 06:00 |

Each job type has **one** schedule; saving again replaces it, and **Remove schedule** clears it. Schedules are stored in the database and **survive restarts** — there's nothing to configure in environment variables.

> Scheduled runs use the server's timezone (UTC by default).

## Notes

- **Admin only.** Viewing, running, scheduling, and managing jobs all require the **admin** role.
- The engine runs in-process with the app and is safe across multiple replicas — each scheduled or queued job runs exactly once regardless of how many app instances are running.
- To disable background jobs entirely, set `ENABLE_JOBS=false`.

## For developers: adding a job type

Adding a new job type is a small code change (no migration, no new API route, no UI change):

1. Write a **worker** in `src/features/jobs/handlers/` — an async function that receives a batch of jobs and does the work.
2. Add the queue name to `QUEUE` in `src/features/jobs/job-queues.ts`.
3. Add one entry to `JOB_TYPES` in `src/features/jobs/job-registry.ts` (label, description, example payload, worker).

On the next start the engine creates the queue and attaches the worker; the new type appears in the UI with Run now, scheduling, and run history working automatically.
