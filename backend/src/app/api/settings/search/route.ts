// app/api/settings/search/route.ts

import {
    handleGetGlobalSettings,
    handleUpdateGlobalSettings,
} from '@/features/global-settings/global-settings.api.handlers';

export const GET = handleGetGlobalSettings;
export const PUT = handleUpdateGlobalSettings;
