// app/api/system-defaults/ai/route.ts

import {
    handleGetSystemDefaults,
    handleUpdateSystemDefaults,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetSystemDefaults;
export const PUT = handleUpdateSystemDefaults;