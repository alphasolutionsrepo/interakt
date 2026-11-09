// src/features/health/health.api.handlers.ts

/**
 * Health Monitoring API Handlers
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './health.service';

import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
import { can } from '@/features/access/user-access';

const logger = createLogger('health-handlers');

/** Health is for every signed-in user; AI provider addresses only for roles that view providers */
async function forRole<T>(health: T): Promise<T> {
  const { access } = await checkAccess(SIGNED_IN);
  return access && can(access, 'ai-providers:view') ? health : service.withoutProviderAddresses(health);
}

/**
 * GET /api/health
 * Get overall system health status
 */
export async function handleGetSystemHealth(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in to view system health');
    }

    const health = await forRole(await service.checkSystemHealth());

    logger.info('System health check requested', {
      userId,
      status: health.status,
    });

    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getSystemHealth' });
  }
}

/**
 * GET /api/health/database
 * Check database health
 */
export async function handleGetDatabaseHealth(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const health = await service.checkDatabaseHealth();
    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getDatabaseHealth' });
  }
}

/**
 * GET /api/health/elasticsearch
 * Check Elasticsearch health
 */
export async function handleGetElasticsearchHealth(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const health = await service.checkElasticsearchHealth();
    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getElasticsearchHealth' });
  }
}

/**
 * GET /api/health/ai-providers
 * Check AI providers health
 */
export async function handleGetAIProvidersHealth(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const health = await forRole(await service.checkAIProvidersHealth());
    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getAIProvidersHealth' });
  }
}
