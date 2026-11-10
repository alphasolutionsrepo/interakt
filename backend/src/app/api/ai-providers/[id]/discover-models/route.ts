// app/api/ai-providers/[id]/discover-models/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleDiscoverModels } from '@/features/ai-providers/ai-providers.api.handlers';

export const POST = withPermission('ai-providers:manage', handleDiscoverModels);