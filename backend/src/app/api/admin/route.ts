// app/api/admin/seed/route.ts

/**
 * Admin Seeding API
 * 
 * Provides manual control over seeding operations.
 * Useful for:
 * - Force reseeding after seed data changes
 * - Verifying seeded data
 * - Clearing seed registry
 * - Checking seeding status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAllSeeding,
  verifyAllSeeding,
  getOverallSeedingStatus,
} from '@/shared/seeders';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

const logger = createLogger('admin-seed-api');

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

// ============================================================================
// POST: Trigger Seeding
// ============================================================================

/**
 * POST /api/admin/seed
 * 
 * Trigger seeding operations
 * 
 * Body:
 * - type: 'all' (default: 'all')
 * - force: boolean (default: false) - Force reseed even if data exists
 * - dryRun: boolean (default: false) - Preview what would happen
 * - keys: string[] (optional) - Specific template slugs to seed
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication (optional - you may want admin-only)
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const {
      type = 'all',
      force = false,
      dryRun = false,
      keys,
    } = body;

    logger.info('Seeding triggered via API', {
      type,
      force,
      dryRun,
      keys,
      triggeredBy: userId,
    });

    let result;

    switch (type) {
      case 'all':
      default:
        result = await runAllSeeding({ force, dryRun, keys });
        return NextResponse.json({
          success: result.success,
          message: result.success 
            ? 'All seeding completed' 
            : 'Seeding completed with errors',
          data: {
            operations: result.operations.map(op => ({
              type: op.seedType,
              totalProcessed: op.totalProcessed,
              created: op.created,
              skipped: op.skipped,
              updated: op.updated,
              errors: op.errors,
              duration: `${op.duration}ms`,
            })),
            totalDuration: `${result.totalDuration}ms`,
          },
          timestamp: result.timestamp,
        });
    }

  } catch (error) {
    logger.error('Seeding API failed', error as Error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Status & Verification
// ============================================================================

/**
 * GET /api/admin/seed
 * 
 * Get seeding status and verify seeded data
 * 
 * Query params:
 * - operation: 'status' | 'verify' | 'list' (default: 'status')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') || 'status';

    switch (operation) {
      case 'verify':
        const verification = await verifyAllSeeding();
        return NextResponse.json({
          success: true,
          data: {
            operation: 'verify',
            valid: verification.success,
            details: verification,
          },
          timestamp: new Date().toISOString(),
        });

      case 'list':
        return NextResponse.json({
          success: true,
          data: {
            operation: 'list',
            availableSeeds: {
              // Add seed types as they're implemented
            },
          },
          timestamp: new Date().toISOString(),
        });

      case 'status':
      default:
        const status = await getOverallSeedingStatus();
        return NextResponse.json({
          success: true,
          data: {
            operation: 'status',
            ...status,
          },
          timestamp: new Date().toISOString(),
        });
    }

  } catch (error) {
    logger.error('Seed status API failed', error as Error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE: Clear Registry
// ============================================================================

/**
 * DELETE /api/admin/seed
 * 
 * Clear seed registry to allow re-seeding
 * 
 * Body:
 * - type: 'all' (required)
 * - confirm: boolean (required, must be true)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { type, confirm } = body;

    if (!confirm) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Confirmation required. Set "confirm: true" in request body.',
        },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        {
          success: false,
          error: 'Type is required. Use "all".',
        },
        { status: 400 }
      );
    }

    logger.warn('Seed registry clear triggered', {
      type,
      clearedBy: userId,
    });

    const clearedCount = 0;

    switch (type) {
      case 'all':
        // Add more types as they're implemented
        // clearedCount += await clearRegistryByType(SEED_TYPES.RESPONSE_TEMPLATE);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown type: ${type}. Use "all".`,
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedCount} registry entries for type "${type}"`,
      data: {
        type,
        clearedCount,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Seed registry clear failed', error as Error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}