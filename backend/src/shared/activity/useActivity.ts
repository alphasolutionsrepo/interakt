// src/shared/activity/useActivity.ts

'use client';

import { useSyncExternalStore } from 'react';

import { activityStore, type ActivityEntry } from './activity-store';

const EMPTY: ActivityEntry[] = [];

/** The activity list, re-rendering when it changes here or in another tab */
export function useActivity(): ActivityEntry[] {
    return useSyncExternalStore(activityStore.subscribe, activityStore.get, () => EMPTY);
}
