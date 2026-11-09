// app/api/system-defaults/ai/resolved/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetResolvedDefaults } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('settings:view', handleGetResolvedDefaults);