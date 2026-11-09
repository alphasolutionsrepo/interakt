// app/api/ai-provider-models/for-purpose/route.ts

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleGetModelsForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, handleGetModelsForPurpose);