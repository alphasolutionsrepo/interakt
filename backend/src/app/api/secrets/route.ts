import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListSecrets, handleCreateSecret } from '@/features/secrets/secrets.api.handlers';

export const GET = withPermission('secrets:manage', async function GET(request: NextRequest) {
  return handleListSecrets(request);
});

export const POST = withPermission('secrets:manage', async function POST(request: NextRequest) {
  return handleCreateSecret(request);
});
