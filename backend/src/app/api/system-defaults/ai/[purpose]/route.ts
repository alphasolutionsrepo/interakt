// app/api/system-defaults/ai/[purpose]/route.ts

import { handleSetDefaultForPurpose } from '@/features/ai-providers/ai-providers.api.handlers';

export const PUT = handleSetDefaultForPurpose;