// src/features/health/health.api.handlers.ts

/**
 * Health Monitoring API Handlers
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './health.service';

const logger = createLogger('health-handlers');

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

    const health = await service.checkSystemHealth();

    logger.info('System health check requested', {
      userId,
      status: health.status,
    });

    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get system health', err);
    return apiResponse.error(err);
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
    logger.error('Failed to check database health', err);
    return apiResponse.error(err);
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
    logger.error('Failed to check Elasticsearch health', err);
    return apiResponse.error(err);
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

    const health = await service.checkAIProvidersHealth();
    return apiResponse.success(health);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to check AI providers health', err);
    return apiResponse.error(err);
  }
}
