'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { TimeRange } from './hooks/useAnalytics';
import {
  DEFAULT_PERIOD,
  approximateTimeRange,
  browserTimeZone,
  parsePeriod,
  periodFromParams,
  periodLabel,
  serializePeriod,
  writePeriodParams,
  type Period,
} from './period';

/** URL query param that carries the experience across reloads and shared links (the period uses range or from/to) */
const EXPERIENCE_PARAM = 'experience';
/** Fallback for full-page navigation between analytics pages (sidebar links drop the query string) */
const EXPERIENCE_STORAGE_KEY = 'analytics.experienceId';
const PERIOD_STORAGE_KEY = 'analytics.period';

function readStored(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | undefined) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode, blocked) — URL params still work
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type ExperienceType = 'ai' | 'search';

interface SetExperienceOptions {
  /** Keep this selection even if the experience has since been deleted */
  keepWhenMissing?: boolean;
}

interface AnalyticsContextValue {
  /** Selected experience ID, undefined = all experiences */
  experienceId: string | undefined;
  /** Display name of selected experience */
  experienceName: string;
  /** Type of selected experience */
  experienceType: ExperienceType | undefined;
  /** Update the selected experience */
  setExperience: (id: string | undefined, name?: string, type?: ExperienceType, options?: SetExperienceOptions) => void;
  /** True when the selection came from a saved record (e.g. a chat session) and must be kept even if the experience no longer exists */
  keepWhenMissing: boolean;
  /** Selected period (preset or custom dates), shared by every analytics section */
  period: Period;
  setPeriod: (period: Period) => void;
  /** "Last 7 days", "Oct 1 – Oct 13" */
  periodLabel: string;
  /** The viewer's time zone, which days and "today" follow */
  timeZone: string;
  /**
   * The nearest fixed range to the period, for what only understands those:
   * stored insights and the analytics chat.
   */
  timeRange: TimeRange;
}

// ============================================================================
// CONTEXT
// ============================================================================

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function AnalyticsProvider({
  children,
  fixedPeriod,
}: {
  children: ReactNode;
  /**
   * A period that doesn't change, for pages outside Analytics (the home page asks
   * about the last 7 days). The selection is then neither read from nor written to
   * the URL and session, so Analytics keeps its own.
   */
  fixedPeriod?: Period;
}) {
  const [experienceId, setExperienceId] = useState<string | undefined>(undefined);
  const [experienceName, setExperienceName] = useState('All Experiences');
  const [experienceType, setExperienceType] = useState<ExperienceType | undefined>(undefined);
  const [period, setPeriod] = useState<Period>(fixedPeriod ?? DEFAULT_PERIOD);
  const [keepWhenMissing, setKeepWhenMissing] = useState(false);
  const [timeZone, setTimeZone] = useState('UTC');

  const pathname = usePathname();

  const setExperience = useCallback((id: string | undefined, name?: string, type?: ExperienceType, options?: SetExperienceOptions) => {
    setExperienceId(id);
    setExperienceName(name || (id ? 'Selected experience' : 'All Experiences'));
    setExperienceType(id ? type : undefined);
    setKeepWhenMissing(!!id && !!options?.keepWhenMissing);
  }, []);

  // Restore the selection from the URL (or this tab's last selection) on first load. Name
  // and type are filled in by ExperienceSelector once the experience list has loaded.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setTimeZone(browserTimeZone());
    if (fixedPeriod) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.has(EXPERIENCE_PARAM) ? params.get(EXPERIENCE_PARAM) : readStored(EXPERIENCE_STORAGE_KEY);
    if (id) setExperience(id);
    const restoredPeriod = periodFromParams(params) ?? parsePeriod(readStored(PERIOD_STORAGE_KEY));
    if (restoredPeriod) setPeriod(restoredPeriod);
    setRestored(true);
    // The fixed period is decided once, by the page that mounts the provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setExperience]);

  // Keep the URL and session storage in sync with the selection, including after switching analytics tabs
  useEffect(() => {
    if (!restored) return;
    writeStored(EXPERIENCE_STORAGE_KEY, experienceId);
    writeStored(PERIOD_STORAGE_KEY, serializePeriod(period));
    const url = new URL(window.location.href);
    if (experienceId) {
      url.searchParams.set(EXPERIENCE_PARAM, experienceId);
    } else {
      url.searchParams.delete(EXPERIENCE_PARAM);
    }
    writePeriodParams(url, period);
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url.href);
    }
  }, [restored, experienceId, period, pathname]);

  const value = useMemo(
    () => ({
      experienceId,
      experienceName,
      experienceType,
      setExperience,
      keepWhenMissing,
      period,
      setPeriod,
      periodLabel: periodLabel(period),
      timeZone,
      timeRange: approximateTimeRange(period),
    }),
    [experienceId, experienceName, experienceType, setExperience, keepWhenMissing, period, timeZone],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }
  return context;
}
