'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dataSourcesApi } from '../api-client';
import type { HealthCheckResult } from '../api-client';
import { dataSourceKeys } from './useDataSources';

const THROTTLE_MS = 60_000; // 1 minute between auto-checks per data source
const STORAGE_PREFIX = 'ds-health-check-';

function getLastCheckTime(id: string): number {
  try {
    return Number(sessionStorage.getItem(`${STORAGE_PREFIX}${id}`)) || 0;
  } catch {
    return 0;
  }
}

function setLastCheckTime(id: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${id}`, String(Date.now()));
  } catch {
    // sessionStorage unavailable — ignore
  }
}

/**
 * Hook that performs a health check on a data source.
 * Auto-triggers on mount (throttled to once per minute per data source).
 * Also exposes a manual `refresh` function that bypasses the throttle.
 */
export function useHealthCheck(dataSourceId: string | undefined) {
  const queryClient = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const doCheck = useCallback(async (force = false) => {
    if (!dataSourceId || runningRef.current) return;

    // Client-side throttle (skip if checked within THROTTLE_MS, unless forced)
    if (!force) {
      const lastCheck = getLastCheckTime(dataSourceId);
      if (Date.now() - lastCheck < THROTTLE_MS) return;
    }

    runningRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      const res = await dataSourcesApi.checkHealth(dataSourceId);
      setResult(res);
      setLastCheckTime(dataSourceId);
      // Invalidate the data source query so the detail page picks up new health data
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.detail(dataSourceId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setIsChecking(false);
      runningRef.current = false;
    }
  }, [dataSourceId, queryClient]);

  // Auto-check on mount (throttled)
  useEffect(() => {
    if (dataSourceId) {
      doCheck(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId]);

  return {
    isChecking,
    result,
    error,
    /** Force a manual health check (bypasses throttle) */
    refresh: useCallback(() => doCheck(true), [doCheck]),
  };
}
