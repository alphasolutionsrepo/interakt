// app/api/ai-provider-models/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { withPermission } from '@/features/access/route-guard';
import { handleListModels, handleCreateModel } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleListModels);
export const POST = withPermission('ai-providers:manage', handleCreateModel);