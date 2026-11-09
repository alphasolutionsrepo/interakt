// app/api/system-defaults/ai/route.ts

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import {
    handleGetSystemDefaults,
    handleUpdateSystemDefaults,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, handleGetSystemDefaults);
export const PUT = withPermission('settings:manage', handleUpdateSystemDefaults);