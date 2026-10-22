'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { TimeRange } from './hooks/useAnalytics';

/** URL query params that carry the selection across reloads and shared links */
const EXPERIENCE_PARAM = 'experience';
const RANGE_PARAM = 'range';
/** Fallback for full-page navigation between analytics pages (sidebar links drop the query string) */
const EXPERIENCE_STORAGE_KEY = 'analytics.experienceId';
const RANGE_STORAGE_KEY = 'analytics.timeRange';

const DEFAULT_TIME_RANGE: TimeRange = '7d';
export const TIME_RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

function isTimeRange(value: string | null): value is TimeRange {
  return TIME_RANGE_OPTIONS.some((o) => o.value === value);
}

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
  /** Selected time range, shared by the overview and analytics chat */
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [experienceId, setExperienceId] = useState<string | undefined>(undefined);
  const [experienceName, setExperienceName] = useState('All Experiences');
  const [experienceType, setExperienceType] = useState<ExperienceType | undefined>(undefined);
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [keepWhenMissing, setKeepWhenMissing] = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    const id = params.has(EXPERIENCE_PARAM) ? params.get(EXPERIENCE_PARAM) : readStored(EXPERIENCE_STORAGE_KEY);
    if (id) setExperience(id);
    const range = params.has(RANGE_PARAM) ? params.get(RANGE_PARAM) : readStored(RANGE_STORAGE_KEY);
    if (isTimeRange(range)) setTimeRange(range);
    setRestored(true);
  }, [setExperience]);

  // Keep the URL and session storage in sync with the selection, including after switching analytics tabs
  useEffect(() => {
    if (!restored) return;
    writeStored(EXPERIENCE_STORAGE_KEY, experienceId);
    writeStored(RANGE_STORAGE_KEY, timeRange);
    const url = new URL(window.location.href);
    if (experienceId) {
      url.searchParams.set(EXPERIENCE_PARAM, experienceId);
    } else {
      url.searchParams.delete(EXPERIENCE_PARAM);
    }
    url.searchParams.set(RANGE_PARAM, timeRange);
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url.href);
    }
  }, [restored, experienceId, timeRange, pathname]);

  return (
    <AnalyticsContext.Provider
      value={{ experienceId, experienceName, experienceType, setExperience, keepWhenMissing, timeRange, setTimeRange }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
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
