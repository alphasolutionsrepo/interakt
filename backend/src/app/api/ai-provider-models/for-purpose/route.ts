// app/api/ai-provider-models/for-purpose/route.ts

import { handleGetModelsForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetModelsForPurpose;