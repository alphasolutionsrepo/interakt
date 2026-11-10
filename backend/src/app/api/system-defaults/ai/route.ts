// app/api/system-defaults/ai/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { withPermission } from '@/features/access/route-guard';
import {
    handleGetSystemDefaults,
    handleUpdateSystemDefaults,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleGetSystemDefaults);
export const PUT = withPermission('settings:manage', handleUpdateSystemDefaults);