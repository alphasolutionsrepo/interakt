import { NextRequest } from 'next/server';
import { handleListDataSources, handleCreateDataSource } from '@/features/data-source/data-source.api.handlers';

export async function GET(request: NextRequest) {
  return handleListDataSources(request);
}

export async function POST(request: NextRequest) {
  return handleCreateDataSource(request);
}
