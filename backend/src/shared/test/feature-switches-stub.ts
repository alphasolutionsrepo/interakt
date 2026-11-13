// src/shared/test/feature-switches-stub.ts

/**
 * For tests about something other than feature switches: every area is on, while the real
 * gates (route guard, public route wrapper, token checks) still ask. Stubs the one answer
 * they ask, isAreaOn:
 *
 *   vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
 *
 * featureSwitchesStub.off turns areas off for one test. The switches themselves (storage,
 * the deployment setting, what an area needs) are tested against a real database in
 * features/feature-switches/*.test.ts.
 */

import type { Area } from '@/features/feature-switches/areas';

export const featureSwitchesStub: { off: Set<Area>; reset(): void } = {
  off: new Set(),
  reset() {
    this.off = new Set();
  },
};

export const featureSwitchesService = {
  isAreaOn: async (area: Area) => !featureSwitchesStub.off.has(area),
};
