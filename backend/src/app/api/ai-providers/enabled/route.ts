// app/api/ai-providers/enabled/route.ts

import { forModelReaders } from '@/features/access/provider-addresses';
import { handleGetEnabledProviders } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = forModelReaders(handleGetEnabledProviders);