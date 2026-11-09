// app/api/ai-providers/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleListProviders, handleCreateProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleListProviders);
export const POST = withPermission('ai-providers:manage', handleCreateProvider);