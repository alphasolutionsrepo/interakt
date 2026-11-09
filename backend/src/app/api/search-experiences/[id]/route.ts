// app/api/search-experiences/[id]/route.ts

/**
 * Search Experience by ID API Route
 *
 * GET    /api/search-experiences/:id - Get a search experience
 * PUT    /api/search-experiences/:id - Update a search experience
 * DELETE /api/search-experiences/:id - Delete a search experience
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetSearchExperience,
  handleUpdateSearchExperience,
  handleDeleteSearchExperience,
} from '@/features/search-experience/search-experience.admin.handlers';

export const GET = withPermission('search-experiences:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetSearchExperience(request, context);
});

export const PUT = withPermission('search-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateSearchExperience(request, context);
});

export const DELETE = withPermission('search-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteSearchExperience(request, context);
});
