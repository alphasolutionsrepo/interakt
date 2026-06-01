// src/features/ai-experience/ai-experience.cache.ts
// Shared cache instance — imported by both ai-experience.service and tools.service
// to avoid a circular dependency while still allowing cross-service cache invalidation.

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';

export const aiExperienceCache = new CacheManager('ai-experience', {
  defaultTTL: cacheConfig.ttl.short, // 1 min — guardrail config changes must propagate quickly
});
