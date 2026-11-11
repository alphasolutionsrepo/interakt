'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { dataSourcesApi } from '../api-client';
import type { HealthCheckResult } from '../api-client';

import { dataSourceKeys } from './useDataSources';

import { useAccess } from '@/shared/access/useAccess';

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
 * Whether a health check should be sent now: there is a data source, the user may run checks,
 * none is running, and (unless forced) the last one was over a minute ago.
 */
export function healthCheckDue(state: { dataSourceId?: string; allowed: boolean; running: boolean; force: boolean; lastCheck: number; now: number }): boolean {
  if (!state.dataSourceId || !state.allowed || state.running) return false;
  return state.force || state.now - state.lastCheck >= THROTTLE_MS;
}

/**
 * Hook that performs a health check on a data source.
 * Auto-triggers on mount (throttled to once per minute per data source).
 * Also exposes a manual `refresh` function that bypasses the throttle.
 *
 * Only for a user who may run health checks (they contact the external service): for anyone
 * else neither the automatic nor the manual check is sent, so pages don't fire requests the
 * server refuses. Every page using this hook gets that from here.
 */
export function useHealthCheck(dataSourceId: string | undefined) {
  const queryClient = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const allowed = useAccess().canDo('data-sources.health-check');

  const doCheck = useCallback(async (force = false) => {
    const lastCheck = dataSourceId ? getLastCheckTime(dataSourceId) : 0;
    if (!healthCheckDue({ dataSourceId, allowed, running: runningRef.current, force, lastCheck, now: Date.now() })) return;

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
  }, [dataSourceId, allowed, queryClient]);

  // Auto-check on mount (throttled), and once access is known to allow it
  useEffect(() => {
    if (dataSourceId && allowed) {
      doCheck(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId, allowed]);

  return {
    isChecking,
    result,
    error,
    /** Force a manual health check (bypasses throttle) */
    refresh: useCallback(() => doCheck(true), [doCheck]),
  };
}
