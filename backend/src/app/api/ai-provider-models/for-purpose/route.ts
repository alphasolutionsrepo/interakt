// app/api/ai-provider-models/for-purpose/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { handleGetModelsForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleGetModelsForPurpose);