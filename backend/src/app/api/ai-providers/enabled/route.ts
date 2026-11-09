// app/api/ai-providers/enabled/route.ts

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleGetEnabledProviders } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, handleGetEnabledProviders);