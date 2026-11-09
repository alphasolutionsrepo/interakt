// app/api/ai-providers/enabled/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetEnabledProviders } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleGetEnabledProviders);