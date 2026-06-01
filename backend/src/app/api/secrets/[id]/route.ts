import { NextRequest } from 'next/server';
import {
  handleGetSecret,
  handleUpdateSecret,
  handleDeleteSecret,
} from '@/features/secrets/secrets.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetSecret(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateSecret(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteSecret(request, context);
}
