// app/api/ai-providers/[id]/test-connection/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleTestConnection } from '@/features/ai-providers/ai-providers.api.handlers';

export const POST = withPermission('ai-providers:manage', handleTestConnection);