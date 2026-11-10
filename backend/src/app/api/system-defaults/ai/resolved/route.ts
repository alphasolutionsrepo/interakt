// app/api/system-defaults/ai/resolved/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { handleGetResolvedDefaults } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleGetResolvedDefaults);