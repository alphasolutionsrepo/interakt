// src/features/dashboard/home.service.ts

/**
 * The home page in one read: the last 7 days against the 7 before, what needs
 * someone now (task counts), short stories about the data (stored findings and
 * large changes), tips that apply to this install, and the busiest experiences.
 *
 * Everything comes from counts and the insights the nightly job stores; nothing
 * calls a model, so the page stays fast. The result is cached for a minute.
 */

import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { getExperienceSummaries, type ExperienceSummary } from '@/features/analytics/analytics-experience-summary.service';
import { countRecentRequests, getTurnsByDay } from '@/features/analytics/analytics-failed-turns.service';
import { getProactiveInsights, getStoredInsight, listDismissedTips } from '@/features/analytics/analytics-insights.service';
import { calendarDaysIn, describePeriod, previousPeriodIn } from '@/features/analytics/analytics-period';
import {
  getOverviewMetrics,
  getSearchTrends,
  getSearchTypeBreakdown,
  getZeroResultQueries,
} from '@/features/analytics/analytics-query.service';
import type { HealthCheckOutput } from '@/features/jobs/handlers/health-check.handler';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('home');

// ============================================================================
// TYPES
// ============================================================================

export interface HomeMetric {
  key: 'turns' | 'searches' | 'foundResults' | 'failedTurns';
  label: string;
  kind: 'count' | 'rate';
  /** null when there is nothing to measure (a rate with no searches) */
  value: number | null;
  previous: number | null;
  /** true: up is good, false: down is good, absent: neither */
  higherIsBetter?: boolean;
  /** One value per day of the period, oldest first; null for a rate on a day without searches */
  series: Array<number | null>;
  /** How many events the figure is based on, so small samples can say so */
  basedOn: number;
  href: string;
}

export interface HomeTask {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: 'critical' | 'warning';
}

export interface HomeCard {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'good';
  /** Small label above the title: "Search", "Content gap" */
  eyebrow: string;
  title: string;
  body: string;
  /** A mini chart: this period's days, and the period before for comparison */
  chart?: { current: number[]; previous?: number[]; fromLabel: string; toLabel: string };
  href: string;
  linkLabel: string;
  /** A question for the Ask chat about this card */
  ask?: string;
}

export interface HomeTip {
  id: string;
  title: string;
  body: string;
  action: { label: string; href: string };
}

export interface HomeExperience {
  id: string;
  name: string;
  type: 'ai' | 'search';
  active: boolean;
  /** Conversations (chat) or searches (search) in the period */
  volume: number;
  issue: string | null;
  /** Conversations or searches per day over the period, oldest first */
  trend: number[];
  href: string;
  analyticsHref: string;
}

/** The latest result of the scheduled health check (database, search engine, AI providers) */
export interface HomeHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checkedAt: string;
  /** No check in over 30 minutes: the jobs engine may be off */
  stale: boolean;
  problems: Array<{ name: string; status: 'degraded' | 'unhealthy'; message?: string }>;
}

/** Setup steps a new installation goes through; shown until all are done */
export interface HomeChecklistStep {
  id: 'provider' | 'content' | 'experience' | 'traffic' | 'ask';
  label: string;
  done: boolean;
  href: string;
}

/** Something that changed lately: an edit, a reindex, a job run */
export interface HomeChange {
  id: string;
  kind: 'experience' | 'index' | 'reindex' | 'job';
  label: string;
  detail: string;
  at: string;
  href: string;
  failed?: boolean;
}

export interface HomeData {
  generatedAt: string;
  period: { from: string; to: string; label: string; previousLabel: string; days: string[] };
  live: { requestsLast5Min: number };
  /** null when no health check has run yet (or the jobs engine is off) */
  health: HomeHealth | null;
  /** null once every step is done */
  checklist: HomeChecklistStep[] | null;
  metrics: HomeMetric[];
  tasks: HomeTask[];
  cards: HomeCard[];
  tips: HomeTip[];
  experiences: HomeExperience[];
  recent: HomeChange[];
}

// ============================================================================
// PERIOD
// ============================================================================

const DAYS = 7;

/** "2026-10-13" for `date` in `timeZone` */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last 7 calendar days in the viewer's time zone (today so far included), as the analytics pages count them */
function lastSevenDays(timeZone: string, now: Date) {
  const today = dayKey(now, timeZone);
  const firstDay = addDays(today, -(DAYS - 1));
  const current = calendarDaysIn(firstDay, today, timeZone, now);
  const previous = previousPeriodIn(current, timeZone);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(firstDay, i));
  const previousDays = Array.from({ length: DAYS }, (_, i) => addDays(firstDay, i - DAYS));
  return { current, previous, days, previousDays };
}

/** Values keyed by calendar day, laid out over `days` (missing days are 0) */
function byDay(days: string[], values: Map<string, number>): number[] {
  return days.map((d) => values.get(d) ?? 0);
}

// ============================================================================
// MAIN READ (cached)
// ============================================================================

/** Fresh for a minute; after that served as it is while a refresh runs, up to 10 minutes */
const FRESH_MS = 60_000;
const STALE_MS = 10 * 60_000;

interface CacheEntry {
  at: number;
  data: Promise<HomeData>;
  refreshing?: boolean;
}
// On globalThis: Next can load this module once per route, and the route that
// dismisses a tip must clear the same cache the home route reads
const globalHome = globalThis as typeof globalThis & { __interaktHomeCache?: Map<string, CacheEntry> };
globalHome.__interaktHomeCache ??= new Map<string, CacheEntry>();
const cache = globalHome.__interaktHomeCache;

function rebuild(timeZone: string): CacheEntry {
  const entry: CacheEntry = { at: Date.now(), data: buildHomeData(timeZone, new Date()) };
  // A failed read isn't kept
  entry.data.catch(() => {
    if (cache.get(timeZone) === entry) cache.delete(timeZone);
  });
  return entry;
}

/** Drop the cached page, after something it shows was changed (a tip dismissed, a finding hidden) */
export function invalidateHomeCache(): void {
  cache.clear();
}

/**
 * The home page data for a viewer in `timeZone`. Nobody waits for a rebuild once
 * the page has been built: data older than a minute is returned straight away
 * and refreshed in the background.
 */
export function getHomeData(timeZone: string): Promise<HomeData> {
  const hit = cache.get(timeZone);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < FRESH_MS) return hit.data;
  if (hit && age < STALE_MS) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      const next = rebuild(timeZone);
      next.data
        .then(() => cache.set(timeZone, next))
        .catch((error) => logger.warn('Home page refresh failed; keeping the last one', { error: String(error) }))
        .finally(() => {
          hit.refreshing = false;
        });
    }
    return hit.data;
  }
  const entry = rebuild(timeZone);
  cache.set(timeZone, entry);
  return entry.data;
}

async function buildHomeData(timeZone: string, now: Date): Promise<HomeData> {
  const started = Date.now();
  const data = await assembleHomeData(timeZone, now);
  logger.info('Home page built', { timeZone, durationMs: Date.now() - started });
  return data;
}

async function assembleHomeData(timeZone: string, now: Date): Promise<HomeData> {
  const { current, previous, days, previousDays } = lastSevenDays(timeZone, now);

  const [
    overviewNow,
    overviewPrev,
    trendsNow,
    trendsPrev,
    turnsNow,
    turnsPrev,
    zeroQueries,
    searchTypes,
    findings,
    summaries,
    live,
    setup,
    failedJobs,
    dismissed,
    health,
    usage,
    recentJobs,
  ] = await Promise.all([
    getOverviewMetrics('custom', undefined, current),
    getOverviewMetrics('custom', undefined, previous),
    getSearchTrends('custom', undefined, current, timeZone),
    getSearchTrends('custom', undefined, previous, timeZone),
    getTurnsByDay(current, timeZone),
    getTurnsByDay(previous, timeZone),
    getZeroResultQueries('custom', undefined, 100, current),
    getSearchTypeBreakdown('custom', undefined, current),
    getProactiveInsights('7d'),
    getExperienceSummaries('custom', current),
    countRecentRequests(5),
    readSetup(),
    countFailedJobs(current.from),
    listDismissedTips(),
    readHealth(now),
    readUsage(),
    readRecentJobs(new Date(now.getTime() - 14 * DAY_MS)),
  ]);

  // ── Daily series ─────────────────────────────────────────────────────
  const searchesByDay = new Map<string, number>();
  const noResultsByDay = new Map<string, number>();
  for (const p of trendsNow) {
    const key = dayKey(new Date(p.timestamp), timeZone);
    searchesByDay.set(key, (searchesByDay.get(key) ?? 0) + p.totalSearches);
    noResultsByDay.set(key, (noResultsByDay.get(key) ?? 0) + p.zeroResults);
  }
  const prevSearchesByDay = new Map<string, number>();
  for (const p of trendsPrev) {
    const key = dayKey(new Date(p.timestamp), timeZone);
    prevSearchesByDay.set(key, (prevSearchesByDay.get(key) ?? 0) + p.totalSearches);
  }
  const turnsByDay = new Map(turnsNow.map((t) => [dayKey(t.day, timeZone), t.turns]));
  const failedByDay = new Map(turnsNow.map((t) => [dayKey(t.day, timeZone), t.failed]));
  const prevFailedByDay = new Map(turnsPrev.map((t) => [dayKey(t.day, timeZone), t.failed]));

  const searchSeries = byDay(days, searchesByDay);
  const foundSeries = days.map((d) => {
    const total = searchesByDay.get(d) ?? 0;
    return total > 0 ? 1 - (noResultsByDay.get(d) ?? 0) / total : null;
  });

  const sum = (rows: Array<{ turns: number; failed: number }>, key: 'turns' | 'failed') => rows.reduce((s, r) => s + r[key], 0);
  const turnsTotal = sum(turnsNow, 'turns');
  const failedTotal = sum(turnsNow, 'failed');
  const prevTurnsTotal = sum(turnsPrev, 'turns');
  const prevFailedTotal = sum(turnsPrev, 'failed');
  const foundNow = overviewNow.totalSearches > 0 ? 1 - overviewNow.zeroResultRate : null;
  const foundPrev = overviewPrev.totalSearches > 0 ? 1 - overviewPrev.zeroResultRate : null;

  const metrics: HomeMetric[] = [
    {
      key: 'turns',
      label: 'Conversation turns',
      kind: 'count',
      value: turnsTotal,
      previous: prevTurnsTotal,
      series: byDay(days, turnsByDay),
      basedOn: turnsTotal,
      href: '/analytics/conversations?range=7d',
    },
    {
      key: 'searches',
      label: 'Searches',
      kind: 'count',
      value: overviewNow.totalSearches,
      previous: overviewPrev.totalSearches,
      series: searchSeries,
      basedOn: overviewNow.totalSearches,
      href: '/analytics/search?range=7d',
    },
    {
      key: 'foundResults',
      label: 'Found results',
      kind: 'rate',
      value: foundNow,
      previous: foundPrev,
      higherIsBetter: true,
      series: foundSeries,
      basedOn: overviewNow.totalSearches,
      href: '/analytics/search?range=7d',
    },
    {
      key: 'failedTurns',
      label: 'Failed turns',
      kind: 'count',
      value: failedTotal,
      previous: prevFailedTotal,
      higherIsBetter: false,
      series: byDay(days, failedByDay),
      basedOn: turnsTotal,
      href: '/analytics/traces?status=ERROR&range=7d',
    },
  ];

  // ── Tasks: what is broken or waiting, with how many ──────────────────
  const tasks: HomeTask[] = [];
  // Services down come first: nothing else matters much while one is
  for (const p of health?.problems ?? []) {
    tasks.push({
      id: `health:${p.name}`,
      label: `${p.name} ${p.status === 'unhealthy' ? 'is down' : 'is degraded'}`,
      count: 1,
      href: '/health',
      tone: p.status === 'unhealthy' ? 'critical' : 'warning',
    });
  }
  if (failedTotal > 0) {
    tasks.push({ id: 'failed-turns', label: 'Review failed conversation turns', count: failedTotal, href: '/analytics/traces?status=ERROR&range=7d', tone: 'critical' });
  }
  if (zeroQueries.length > 0) {
    tasks.push({ id: 'zero-results', label: 'Fix searches that find nothing', count: zeroQueries.length, href: '/analytics/search?range=7d', tone: 'warning' });
  }
  const brokenIndexes = setup.indexes.filter((i) => i.isActive && (i.status === 'error' || i.status === 'offline'));
  if (brokenIndexes.length > 0) {
    tasks.push({
      id: 'broken-indexes',
      label: brokenIndexes.length === 1 ? `Fix ${brokenIndexes[0].name}` : 'Fix indexes with errors',
      count: brokenIndexes.length,
      href: brokenIndexes.length === 1 ? `/search-indexes/${brokenIndexes[0].id}` : '/search-indexes',
      tone: 'critical',
    });
  }
  const needReindex = setup.indexes.filter((i) => i.isActive && i.requiresReindex);
  if (needReindex.length > 0) {
    tasks.push({
      id: 'reindex',
      label: needReindex.length === 1 ? `Reindex ${needReindex[0].name}` : 'Reindex indexes',
      count: needReindex.length,
      href: needReindex.length === 1 ? `/search-indexes/${needReindex[0].id}` : '/search-indexes',
      tone: 'warning',
    });
  }
  if (failedJobs > 0) {
    tasks.push({ id: 'failed-jobs', label: 'Check failed background jobs', count: failedJobs, href: '/jobs', tone: 'warning' });
  }

  // ── Cards: large changes first, then the stored findings ────────────
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const dayLabel = (day: string) => fmt.format(new Date(`${day}T00:00:00Z`));
  const chartLabels = { fromLabel: dayLabel(days[0]), toLabel: dayLabel(days[DAYS - 1]) };
  const cards: HomeCard[] = [];

  const searchesNow = overviewNow.totalSearches;
  const searchesPrev = overviewPrev.totalSearches;
  if (searchesNow >= 20 && searchesPrev >= 20) {
    const change = Math.round(((searchesNow - searchesPrev) / searchesPrev) * 100);
    if (Math.abs(change) >= 25) {
      cards.push({
        id: 'change:searches',
        tone: 'info',
        eyebrow: 'Search',
        title: `Searches are ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on the week before`,
        body: `${searchesNow.toLocaleString()} searches in the last 7 days, against ${searchesPrev.toLocaleString()} the 7 days before.`,
        chart: { current: searchSeries, previous: byDay(previousDays, prevSearchesByDay), ...chartLabels },
        href: '/analytics/search?range=7d',
        linkLabel: 'View searches',
        ask: `Why are searches ${change > 0 ? 'up' : 'down'} compared with the week before?`,
      });
    }
  }
  if (foundNow !== null && foundPrev !== null && searchesNow >= 50 && searchesPrev >= 50) {
    const points = Math.round((foundNow - foundPrev) * 100);
    if (Math.abs(points) >= 3) {
      cards.push({
        id: 'change:found',
        tone: points < 0 ? 'warning' : 'good',
        eyebrow: 'Search quality',
        title: points < 0 ? 'Fewer searches are finding results' : 'More searches are finding results',
        body: `${Math.round(foundNow * 100)}% of searches found results in the last 7 days, ${points < 0 ? 'down' : 'up'} from ${Math.round(foundPrev * 100)}% the week before.`,
        href: '/analytics/search?range=7d',
        linkLabel: 'View searches',
        ask:
          points < 0
            ? 'Which searches stopped finding results compared with the week before, and why?'
            : 'What changed so that more searches find results than the week before?',
      });
    }
  }
  if (failedTotal >= 3 && failedTotal >= prevFailedTotal * 1.5) {
    cards.push({
      id: 'change:failed-turns',
      tone: 'critical',
      eyebrow: 'Conversations',
      title: prevFailedTotal > 0 ? `Failed conversation turns rose from ${prevFailedTotal} to ${failedTotal}` : `${failedTotal} conversation turns failed this week`,
      body: `${failedTotal} of ${turnsTotal.toLocaleString()} turns in the last 7 days didn't complete.`,
      chart: { current: byDay(days, failedByDay), previous: byDay(previousDays, prevFailedByDay), ...chartLabels },
      href: '/analytics/traces?status=ERROR&range=7d',
      linkLabel: 'See failed turns',
      ask: 'Which conversations failed in the last 7 days, and why?',
    });
  }
  const SEVERITY_TONE = { critical: 'critical', warning: 'warning', info: 'info' } as const;
  const CATEGORY_LABEL: Record<string, string> = {
    search_quality: 'Search quality',
    content_gap: 'Content gap',
    ai_behavior: 'AI behaviour',
    cost: 'Cost',
    demand: 'Demand',
  };
  if (findings.status === 'ready') {
    for (const f of findings.insights) {
      cards.push({
        id: `finding:${f.id}`,
        tone: SEVERITY_TONE[f.severity] ?? 'info',
        eyebrow: CATEGORY_LABEL[f.category] ?? 'Finding',
        title: f.title,
        body: f.description,
        href: '/analytics/overview?range=7d',
        linkLabel: 'Open in Analytics',
        ask: `Explain this finding and what's behind it: "${f.title}". ${f.description}`,
      });
    }
  }

  // ── Tips that apply to this install ──────────────────────────────────
  const tips = buildTips({ setup, summaries, zeroQueries, searchTypes, now, dismissed }).filter((t) => !dismissed.has(t.id));
  const guardrailTip = await offTopicTip(setup, summaries, dismissed);
  if (guardrailTip) tips.splice(1, 0, guardrailTip);

  // ── Experiences, busiest first ───────────────────────────────────────
  const volumeById = new Map(summaries.map((s) => [s.id, s]));
  const listed: Array<Omit<HomeExperience, 'trend'>> = setup.experiences
    .map((e) => {
      const s = volumeById.get(e.id);
      const volume = s?.volume ?? 0;
      let issue: string | null = null;
      if (s && e.type === 'ai' && volume >= 10 && s.successRate < 0.9) issue = `${Math.round((1 - s.successRate) * 100)}% of turns failed`;
      else if (s && volume >= 10 && s.zeroResultRate >= 0.2) issue = `${Math.round(s.zeroResultRate * 100)}% of searches found nothing`;
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        active: e.isActive,
        volume,
        issue,
        href: `/experiences/${e.type}/${e.id}`,
        analyticsHref: `/analytics/overview?range=7d&experience=${e.id}`,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.volume - a.volume)
    .slice(0, 6);

  // A week's trend for each listed experience: turns (chat) or searches (search) per day
  const trends = await Promise.all(
    listed.map(async (e) => {
      if (e.volume === 0) return days.map(() => 0);
      if (e.type === 'ai') {
        const rows = await getTurnsByDay(current, timeZone, e.id);
        return byDay(days, new Map(rows.map((r) => [dayKey(r.day, timeZone), r.turns])));
      }
      const points = await getSearchTrends('custom', e.id, current, timeZone);
      const perDay = new Map<string, number>();
      for (const p of points) {
        const key = dayKey(new Date(p.timestamp), timeZone);
        perDay.set(key, (perDay.get(key) ?? 0) + p.totalSearches);
      }
      return byDay(days, perDay);
    }),
  );
  const experiences: HomeExperience[] = listed.map((e, i) => ({ ...e, trend: trends[i] }));

  return {
    generatedAt: now.toISOString(),
    period: {
      from: current.from.toISOString(),
      to: current.to.toISOString(),
      label: 'Last 7 days',
      previousLabel: describePeriod(previous, timeZone),
      days,
    },
    live: { requestsLast5Min: live },
    health,
    checklist: dismissed.has(CHECKLIST_ID) ? null : buildChecklist(setup, usage),
    metrics,
    tasks,
    cards: cards.slice(0, 6),
    tips: tips.slice(0, 3),
    experiences,
    recent: buildRecent(setup, recentJobs, now),
  };
}

// ============================================================================
// SETUP (main database)
// ============================================================================

export interface Setup {
  experiences: Array<{
    id: string;
    name: string;
    type: 'ai' | 'search';
    isActive: boolean;
    createdAt: Date;
    updatedAt?: Date | null;
    guardrailEnforced: boolean;
  }>;
  indexes: Array<{
    id: string;
    name: string;
    status: string;
    isActive: boolean;
    requiresReindex: boolean;
    searchType: string;
    documentCount: number;
    lastIndexedAt: Date | null;
    updatedAt?: Date | null;
    usedByActiveExperience: boolean;
  }>;
  enabledProviders: number;
}

async function readSetup(): Promise<Setup> {
  const { db } = await import('@/db/index');
  const { aiExperiences, searchExperiences, searchIndex, searchExperienceIndexes, aiProviders } = await import('@/db/schema');

  const [ai, search, indexes, inUse, providers] = await Promise.all([
    db
      .select({
        id: aiExperiences.id,
        name: aiExperiences.name,
        isActive: aiExperiences.isActive,
        createdAt: aiExperiences.createdAt,
        updatedAt: aiExperiences.updatedAt,
        enforced: sql<boolean | null>`(${aiExperiences.guardrailConfig}->>'enforced')::boolean`,
      })
      .from(aiExperiences),
    db
      .select({
        id: searchExperiences.id,
        name: searchExperiences.name,
        isActive: searchExperiences.isActive,
        createdAt: searchExperiences.createdAt,
        updatedAt: searchExperiences.updatedAt,
      })
      .from(searchExperiences),
    db
      .select({
        id: searchIndex.id,
        name: sql<string>`COALESCE(${searchIndex.displayName}, ${searchIndex.name})`,
        status: searchIndex.status,
        isActive: searchIndex.isActive,
        requiresReindex: searchIndex.requiresReindex,
        searchType: searchIndex.searchType,
        documentCount: searchIndex.documentCount,
        lastIndexedAt: searchIndex.lastIndexedAt,
        updatedAt: searchIndex.updatedAt,
      })
      .from(searchIndex),
    db
      .selectDistinct({ indexId: searchExperienceIndexes.searchIndexId })
      .from(searchExperienceIndexes)
      .innerJoin(searchExperiences, eq(searchExperiences.id, searchExperienceIndexes.searchExperienceId))
      .where(eq(searchExperiences.isActive, true)),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(aiProviders).where(eq(aiProviders.isEnabled, true)),
  ]);

  const used = new Set(inUse.map((r) => r.indexId));
  return {
    experiences: [
      ...ai.map((e) => ({
        id: e.id,
        name: e.name,
        type: 'ai' as const,
        isActive: e.isActive,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        guardrailEnforced: !!e.enforced,
      })),
      ...search.map((e) => ({
        id: e.id,
        name: e.name,
        type: 'search' as const,
        isActive: e.isActive,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        guardrailEnforced: false,
      })),
    ],
    indexes: indexes.map((i) => ({ ...i, documentCount: Number(i.documentCount ?? 0), usedByActiveExperience: used.has(i.id) })),
    enabledProviders: providers[0]?.count ?? 0,
  };
}

/** Background jobs that failed since `since` (pg-boss keeps them in its own job table) */
async function countFailedJobs(since: Date): Promise<number> {
  try {
    const { db } = await import('@/db/index');
    const rows = (await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM pgboss.job
      WHERE state = 'failed' AND completed_on >= ${since} AND strpos(name, '__pgboss__') = 0
    `)) as unknown as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  } catch (error) {
    // No jobs engine (ENABLE_JOBS=false) means no job table
    logger.warn('Failed jobs not counted', { error: String(error) });
    return 0;
  }
}

/** The latest scheduled health check, read from the job's output */
async function readHealth(now: Date): Promise<HomeHealth | null> {
  try {
    const { db } = await import('@/db/index');
    const rows = (await db.execute(sql`
      SELECT output, completed_on FROM pgboss.job
      WHERE name = 'health-check' AND state = 'completed'
      ORDER BY completed_on DESC
      LIMIT 1
    `)) as unknown as Array<{ output: HealthCheckOutput | null; completed_on: Date | string }>;
    const row = rows[0];
    if (!row?.output?.status) return null;
    const checkedAt = new Date(row.output.checkedAt ?? row.completed_on);
    return {
      status: row.output.status,
      checkedAt: checkedAt.toISOString(),
      stale: now.getTime() - checkedAt.getTime() > 30 * 60_000,
      problems: (row.output.services ?? [])
        .filter((s): s is HomeHealth['problems'][number] => s.status !== 'healthy')
        .map((s) => ({ name: s.name, status: s.status, ...(s.message ? { message: s.message } : {}) })),
    };
  } catch (error) {
    // No jobs engine means no job table, and so no health on the home page
    logger.warn('Health not read', { error: String(error) });
    return null;
  }
}

/** Whether anything has ever been searched or asked, and whether anyone has used Ask */
async function readUsage(): Promise<{ anyTraffic: boolean; askedAQuestion: boolean }> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return { anyTraffic: false, askedAQuestion: false };
  const { adminChatSessions, otelSpans, searchEvents } = await import('@/db/analytics-schema');
  const [searches, turns, sessions] = await Promise.all([
    analyticsDB.select({ one: sql<number>`1` }).from(searchEvents).where(eq(searchEvents.source, 'api')).limit(1),
    analyticsDB.select({ one: sql<number>`1` }).from(otelSpans).where(eq(otelSpans.operationName, 'pipeline.v2.turn')).limit(1),
    analyticsDB.select({ one: sql<number>`1` }).from(adminChatSessions).limit(1),
  ]);
  return { anyTraffic: searches.length > 0 || turns.length > 0, askedAQuestion: sessions.length > 0 };
}

/** Background job runs lately, most recent first (the frequent health check left out) */
async function readRecentJobs(since: Date): Promise<Array<{ id: string; name: string; state: string; at: Date }>> {
  try {
    const { db } = await import('@/db/index');
    const rows = (await db.execute(sql`
      SELECT id, name, state, completed_on FROM pgboss.job
      WHERE state IN ('completed', 'failed') AND completed_on >= ${since}
        AND name <> 'health-check' AND strpos(name, '__pgboss__') = 0 AND strpos(name, '.default-schedule-set') = 0
      ORDER BY completed_on DESC
      LIMIT 5
    `)) as unknown as Array<{ id: string; name: string; state: string; completed_on: Date | string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, state: r.state, at: new Date(r.completed_on) }));
  } catch {
    return [];
  }
}

// ============================================================================
// CHECKLIST AND RECENT CHANGES
// ============================================================================

/** Hiding the checklist is stored like a dismissed tip */
export const CHECKLIST_ID = 'tip:checklist';

/** The first-run checklist, or null once every step is done */
export function buildChecklist(
  setup: Pick<Setup, 'experiences' | 'indexes' | 'enabledProviders'>,
  usage: { anyTraffic: boolean; askedAQuestion: boolean },
): HomeChecklistStep[] | null {
  const firstExperience = setup.experiences[0];
  const steps: HomeChecklistStep[] = [
    { id: 'provider', label: 'Connect an AI provider', done: setup.enabledProviders > 0, href: '/ai-providers' },
    { id: 'content', label: 'Add your content to a search index', done: setup.indexes.some((i) => i.documentCount > 0), href: '/search-indexes/create' },
    { id: 'experience', label: 'Create a chat or search experience', done: setup.experiences.length > 0, href: '/experiences/create' },
    {
      id: 'traffic',
      label: 'Put it on your site with the widget',
      done: usage.anyTraffic,
      href: firstExperience ? `/experiences/${firstExperience.type}/${firstExperience.id}` : '/experiences',
    },
    { id: 'ask', label: 'Ask a question about your data', done: usage.askedAQuestion, href: '#home-ask' },
  ];
  return steps.every((s) => s.done) ? null : steps;
}

const JOB_LABEL: Record<string, string> = { 'refresh-insights': 'Insights refresh' };

/** Edits, reindexes and job runs in the last 14 days, most recent first */
export function buildRecent(setup: Setup, jobs: Array<{ id: string; name: string; state: string; at: Date }>, now: Date): HomeChange[] {
  const since = now.getTime() - 14 * DAY_MS;
  const changes: HomeChange[] = [];
  for (const e of setup.experiences) {
    if (!e.updatedAt || e.updatedAt.getTime() < since) continue;
    const created = Math.abs(e.updatedAt.getTime() - e.createdAt.getTime()) < 60_000;
    changes.push({
      id: `experience:${e.id}`,
      kind: 'experience',
      label: e.name,
      detail: created ? 'Experience created' : 'Experience edited',
      at: e.updatedAt.toISOString(),
      href: `/experiences/${e.type}/${e.id}`,
    });
  }
  for (const i of setup.indexes) {
    if (i.lastIndexedAt && i.lastIndexedAt.getTime() >= since) {
      changes.push({ id: `reindex:${i.id}`, kind: 'reindex', label: i.name, detail: 'Content indexed', at: i.lastIndexedAt.toISOString(), href: `/search-indexes/${i.id}` });
    }
    // An edit distinct from the indexing itself (settings, fields)
    if (i.updatedAt && i.updatedAt.getTime() >= since && (!i.lastIndexedAt || Math.abs(i.updatedAt.getTime() - i.lastIndexedAt.getTime()) > 60_000)) {
      changes.push({ id: `index:${i.id}`, kind: 'index', label: i.name, detail: 'Index settings changed', at: i.updatedAt.toISOString(), href: `/search-indexes/${i.id}` });
    }
  }
  for (const j of jobs) {
    changes.push({
      id: `job:${j.id}`,
      kind: 'job',
      label: JOB_LABEL[j.name] ?? j.name,
      detail: j.state === 'failed' ? 'Background job failed' : 'Background job ran',
      at: j.at.toISOString(),
      href: '/jobs',
      failed: j.state === 'failed',
    });
  }
  return changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}

// ============================================================================
// TIPS
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildTips({
  setup,
  summaries,
  zeroQueries,
  searchTypes,
  now,
  dismissed = new Set<string>(),
}: {
  setup: Setup;
  summaries: ExperienceSummary[];
  zeroQueries: Array<{ query: string; occurrenceCount: number }>;
  searchTypes: { lexical: number; semantic: number; hybrid: number };
  now: Date;
  /** Tips dismissed for good: left out, so the next one of a kind can show */
  dismissed?: Set<string>;
}): HomeTip[] {
  const tips: HomeTip[] = [];
  const active = new Set(summaries.filter((s) => s.volume > 0).map((s) => s.id));

  // An experience that went live over a day ago and nobody has used this week
  const quiet = setup.experiences
    .filter((e) => e.isActive && now.getTime() - e.createdAt.getTime() > DAY_MS && !active.has(e.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  // One at a time, the newest first, so they don't crowd out other tips
  for (const e of quiet.filter((q) => !dismissed.has(`tip:no_traffic:${q.id}`)).slice(0, 1)) {
    tips.push({
      id: `tip:no_traffic:${e.id}`,
      title: `${e.name} had no visitors in the last 7 days`,
      body: 'If it isn’t on your site yet, add the widget to start answering visitors.',
      action: { label: 'Get widget code', href: `/experiences/${e.type}/${e.id}` },
    });
  }

  // Queries that keep finding nothing: synonyms usually fix them
  const repeating = zeroQueries.filter((q) => q.query.trim() && q.query.trim() !== '*' && q.occurrenceCount >= 5);
  if (repeating.length >= 3) {
    const top = repeating.slice(0, 3);
    const total = top.reduce((s, q) => s + q.occurrenceCount, 0);
    tips.push({
      id: 'tip:synonyms',
      title: `${repeating.length} searches keep finding nothing`,
      body: `${top.map((q) => `“${q.query}”`).join(', ')} found nothing ${total} times this week. Synonyms usually fix this.`,
      action: { label: 'Add synonyms', href: '/search-indexes' },
    });
  }

  // Every search uses keyword matching, though an index supports semantic search
  const semanticReady = setup.indexes.some((i) => i.isActive && (i.searchType === 'hybrid' || i.searchType === 'semantic'));
  if (semanticReady && searchTypes.lexical >= 20 && searchTypes.semantic + searchTypes.hybrid === 0) {
    tips.push({
      id: 'tip:keyword_only',
      title: 'All searches use keyword matching',
      body: 'One of your indexes supports semantic search. Hybrid search usually finds more for questions in plain language.',
      action: { label: 'Try hybrid in the playground', href: '/playground/search' },
    });
  }

  // Content an active experience searches that hasn't changed in a month
  const stale = setup.indexes
    .filter((i) => i.isActive && i.usedByActiveExperience && i.documentCount > 0 && i.lastIndexedAt && now.getTime() - i.lastIndexedAt.getTime() > 30 * DAY_MS)
    .sort((a, b) => a.lastIndexedAt!.getTime() - b.lastIndexedAt!.getTime());
  for (const i of stale.filter((x) => !dismissed.has(`tip:stale:${x.id}`)).slice(0, 1)) {
    const days = Math.floor((now.getTime() - i.lastIndexedAt!.getTime()) / DAY_MS);
    tips.push({
      id: `tip:stale:${i.id}`,
      title: `${i.name} was last updated ${days} days ago`,
      body: 'Re-ingest its content to keep answers current.',
      action: { label: 'Open index', href: `/search-indexes/${i.id}` },
    });
  }

  // One AI provider: answers stop if it has an outage
  if (setup.enabledProviders === 1) {
    tips.push({
      id: 'tip:single_provider',
      title: 'Answers depend on one AI provider',
      body: 'Add a second provider as a fallback, so an outage doesn’t stop your assistants.',
      action: { label: 'Add provider', href: '/ai-providers' },
    });
  }

  return tips;
}

/**
 * A chat experience without an enforced guardrail where more than 1 in 10
 * questions were off topic (from the stored guardrail insight). Only the
 * busiest few experiences are checked, to keep the page quick.
 */
async function offTopicTip(setup: Setup, summaries: ExperienceSummary[], dismissed: Set<string>): Promise<HomeTip | null> {
  const candidates = summaries
    .filter((s) => s.type === 'ai' && s.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map((s) => setup.experiences.find((e) => e.id === s.id))
    .filter((e): e is Setup['experiences'][number] => !!e && e.isActive && !e.guardrailEnforced && !dismissed.has(`tip:off_topic:${e.id}`));

  for (const e of candidates) {
    const stored = await getStoredInsight('guardrail_analytics', '7d', e.id);
    const data = stored.data as { totalClassified?: number; classificationDistribution?: Array<{ classification: string; count: number }> } | null;
    const total = data?.totalClassified ?? 0;
    if (total < 20) continue;
    const offTopic = (data?.classificationDistribution ?? []).filter((c) => c.classification !== 'domain').reduce((s, c) => s + c.count, 0);
    const share = offTopic / total;
    if (share > 0.1) {
      return {
        id: `tip:off_topic:${e.id}`,
        title: `1 in ${Math.max(2, Math.round(1 / share))} questions to ${e.name} are off topic`,
        body: 'A guardrail keeps its answers on your content.',
        action: { label: 'Set up guardrails', href: `/experiences/ai/${e.id}/edit` },
      };
    }
  }
  return null;
}

/** The shape of a dismissible tip id, for validating dismiss requests */
export const TIP_ID = /^tip:[a-z_]+(?::[0-9a-f-]{36})?$/;
