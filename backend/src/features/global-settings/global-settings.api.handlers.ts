// src/features/global-settings/global-settings.api.handlers.ts

/**
 * Global Settings API Handlers
 *
 * HTTP handlers for global search settings management.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import {
    getGlobalSettingsForApi,
    updateGlobalSettings,
} from './global-settings.service';

const logger = createLogger('global-settings-api');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const updateSettingsSchema = z.object({
    searchTimeout: z.number()
        .int()
        .min(1000, 'Timeout must be at least 1 second')
        .max(120000, 'Timeout cannot exceed 2 minutes')
        .optional(),
    rrfRankConstant: z.number()
        .int()
        .min(1)
        .max(1000)
        .optional(),
    rrfWindowSize: z.number()
        .int()
        .min(10)
        .max(500)
        .optional(),
    lexicalWeight: z.number()
        .min(0.1, 'Weight must be at least 0.1')
        .max(3.0, 'Weight cannot exceed 3.0')
        .optional(),
    semanticWeight: z.number()
        .min(0.1, 'Weight must be at least 0.1')
        .max(3.0, 'Weight cannot exceed 3.0')
        .optional(),
});

// ============================================================================
// GET HANDLER
// ============================================================================

/**
 * GET /api/settings/search
 * Get global search settings
 */
export async function handleGetGlobalSettings() {
    try {
        const settings = await getGlobalSettingsForApi();
        return apiResponse.success(settings);
    } catch (error) {
        logger.error('Failed to get global settings', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return apiResponse.error(
            error instanceof Error ? error.message : 'Failed to get global settings',
            500
        );
    }
}

// ============================================================================
// PUT HANDLER
// ============================================================================

/**
 * PUT /api/settings/search
 * Update global search settings
 */
export async function handleUpdateGlobalSettings(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const validation = updateSettingsSchema.safeParse(body);
        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        // Check if at least one field is provided
        const data = validation.data;
        if (Object.keys(data).length === 0) {
            return apiResponse.badRequest('At least one setting must be provided');
        }

        // Update settings
        await updateGlobalSettings(data);

        // Return updated settings
        const updated = await getGlobalSettingsForApi();

        logger.info('Global search settings updated', {
            updatedFields: Object.keys(data),
        });

        return apiResponse.success(updated);
    } catch (error) {
        logger.error('Failed to update global settings', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Handle validation errors from service
        if (error instanceof Error && error.message.startsWith('Invalid settings:')) {
            return apiResponse.badRequest(error.message);
        }

        return apiResponse.error(
            error instanceof Error ? error.message : 'Failed to update global settings',
            500
        );
    }
}
