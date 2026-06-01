import { NextRequest } from 'next/server';
import { handleListSecrets, handleCreateSecret } from '@/features/secrets/secrets.api.handlers';

export async function GET(request: NextRequest) {
  return handleListSecrets(request);
}

export async function POST(request: NextRequest) {
  return handleCreateSecret(request);
}
