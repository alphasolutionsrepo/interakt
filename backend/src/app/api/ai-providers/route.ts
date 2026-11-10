// app/api/ai-providers/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { withPermission } from '@/features/access/route-guard';
import { handleListProviders, handleCreateProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleListProviders);
export const POST = withPermission('ai-providers:manage', handleCreateProvider);