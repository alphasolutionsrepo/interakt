// src/shared/test/feature-switches-stub.ts

/**
 * For tests about something other than feature switches: every area is on, while the real
 * gates (route guard, public route wrapper, token checks) still ask. Stubs the answers
 * they ask, isAreaOn and listFeatureSwitches (id and on only); nothing is off by the
 * deployment setting (offByDeployment), so stubbed areas are asked through isAreaOn:
 *
 *   vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
 *
 * featureSwitchesStub.off turns areas off for one test. The switches themselves (storage,
 * the deployment setting, what an area needs) are tested against a real database in
 * features/feature-switches/*.test.ts.
 */

import { AREA_IDS, type Area } from '@/features/feature-switches/areas';

export const featureSwitchesStub: { off: Set<Area>; reset(): void } = {
  off: new Set(),
  reset() {
    this.off = new Set();
  },
};

export const featureSwitchesService = {
  offByDeployment: (_area: Area) => false,
  isAreaOn: async (area: Area) => !featureSwitchesStub.off.has(area),
  listFeatureSwitches: async () => AREA_IDS.map((id) => ({ id, on: !featureSwitchesStub.off.has(id) })),
};
