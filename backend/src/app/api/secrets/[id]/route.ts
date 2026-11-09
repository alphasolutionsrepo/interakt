import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetSecret,
  handleUpdateSecret,
  handleDeleteSecret,
} from '@/features/secrets/secrets.api.handlers';

export const GET = withPermission('secrets:manage', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetSecret(request, context);
});

export const PUT = withPermission('secrets:manage', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateSecret(request, context);
});

export const DELETE = withPermission('secrets:manage', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteSecret(request, context);
});
