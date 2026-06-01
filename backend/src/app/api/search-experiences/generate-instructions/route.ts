// app/api/search-experiences/generate-instructions/route.ts

/**
 * API endpoint for generating custom instructions using AI
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import { generateCustomInstructions } from '@/features/search-experience/search-experience.service';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('api-generate-instructions');

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const generateInstructionsSchema = z.object({
  experienceName: z.string().min(1, 'Experience name is required'),
  experienceDescription: z.string().optional(),
  indexIds: z.array(z.string().uuid()).min(1, 'At least one index is required'),
  additionalContext: z.string().max(2000).optional(),
  type: z.enum(['summary']),
});

// ============================================================================
// POST - Generate custom instructions
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const body = await request.json();

    // Validate input
    const validationResult = generateInstructionsSchema.safeParse(body);
    if (!validationResult.success) {
      return apiResponse.validationError(validationResult.error);
    }

    const input = validationResult.data;

    logger.info('Generating custom instructions', {
      experienceName: input.experienceName,
      indexCount: input.indexIds.length,
      type: input.type,
      userId,
    });

    // Generate instructions using AI
    const generatedInstructions = await generateCustomInstructions({
      experienceName: input.experienceName,
      experienceDescription: input.experienceDescription,
      indexIds: input.indexIds,
      additionalContext: input.additionalContext,
      type: input.type,
    });

    return apiResponse.success({
      instructions: generatedInstructions,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate custom instructions', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound('One or more indexes not found');
    }

    return apiResponse.error('Failed to generate instructions. Please try again.', 500);
  }
}
