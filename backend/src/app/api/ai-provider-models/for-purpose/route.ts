// app/api/ai-provider-models/for-purpose/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetModelsForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleGetModelsForPurpose);