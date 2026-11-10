// app/api/system-defaults/ai/[purpose]/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleSetDefaultForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const PUT = withPermission('settings:manage', handleSetDefaultForPurpose);