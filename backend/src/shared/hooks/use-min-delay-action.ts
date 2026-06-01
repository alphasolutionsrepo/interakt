'use client';

import { useCallback, useRef, useState } from 'react';

const DEFAULT_MIN_DELAY = 600;

/**
 * Wraps an async action to guarantee a minimum visible loading duration.
 * Prevents jarring flash of loading state on fast responses.
 *
 * Usage:
 *   const [execute, isLoading] = useMinDelayAction(async () => { await save(); }, 600);
 *   <Button onClick={execute} disabled={isLoading}>Save</Button>
 */
export function useMinDelayAction<T>(
  action: () => Promise<T>,
  minDelay = DEFAULT_MIN_DELAY,
): [() => Promise<T | undefined>, boolean] {
  const [isLoading, setIsLoading] = useState(false);
  const activeRef = useRef(false);

  const execute = useCallback(async () => {
    if (activeRef.current) return undefined;
    activeRef.current = true;
    setIsLoading(true);

    const start = Date.now();
    try {
      const result = await action();
      const elapsed = Date.now() - start;
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }
      return result;
    } finally {
      setIsLoading(false);
      activeRef.current = false;
    }
  }, [action, minDelay]);

  return [execute, isLoading];
}
