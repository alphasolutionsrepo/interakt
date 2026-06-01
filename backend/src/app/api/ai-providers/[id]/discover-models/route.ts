// app/api/ai-providers/[id]/discover-models/route.ts

import { handleDiscoverModels } from '@/features/ai-providers/ai-providers.api.handlers';

export const POST = handleDiscoverModels;