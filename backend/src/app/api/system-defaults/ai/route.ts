// app/api/system-defaults/ai/route.ts

import { withPermission } from '@/features/access/route-guard';
import {
    handleGetSystemDefaults,
    handleUpdateSystemDefaults,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('settings:view', handleGetSystemDefaults);
export const PUT = withPermission('settings:manage', handleUpdateSystemDefaults);