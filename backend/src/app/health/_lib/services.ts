// app/health/_lib/services.ts
// Pure helpers for laying out and summarising the health services.

import type { ServiceHealth } from './api-client';

export interface GroupedServices {
  primary: ServiceHealth[];
  infrastructure: ServiceHealth[];
  setup: ServiceHealth[];
}

// AI Providers first, config-only checks in setup, everything else is infrastructure.
// Every service passed in lands in exactly one group.
export function groupServices(services: ServiceHealth[]): GroupedServices {
  const grouped: GroupedServices = { primary: [], infrastructure: [], setup: [] };
  for (const service of services) {
    if (service.configOnly) grouped.setup.push(service);
    else if (service.name === 'AI Providers') grouped.primary.push(service);
    else grouped.infrastructure.push(service);
  }
  return grouped;
}

// Config-only checks make no network call, so their 0 ms would skew the average.
export function averageResponseTime(services: ServiceHealth[]): number {
  const timed = services.filter(s => !s.configOnly);
  if (timed.length === 0) return 0;
  return Math.round(timed.reduce((sum, s) => sum + s.responseTime, 0) / timed.length);
}

// Service names carry a suffix for some checks, e.g. 'Search Provider (elasticsearch)'.
export function lookupByName<T>(map: Record<string, T>, name: string): T | undefined {
  if (name in map) return map[name];
  if (name.startsWith('Search Provider')) return map['Search Provider'];
  return undefined;
}

// A healthy check's message is one line, except a settings check's: its note (like how many
// requests had no trusted address) is the point of the card. Unhealthy messages say what to do.
export function showsFullMessage(service: ServiceHealth): boolean {
  return service.configOnly === true || service.status !== 'healthy';
}
