// app/api/settings/search/route.ts

import { withPermission } from '@/features/access/route-guard';
import {
    handleGetGlobalSettings,
    handleUpdateGlobalSettings,
} from '@/features/global-settings/global-settings.api.handlers';

export const GET = withPermission('settings:view', handleGetGlobalSettings);
export const PUT = withPermission('settings:manage', handleUpdateGlobalSettings);
