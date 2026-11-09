// app/api/ai-providers/[id]/route.ts

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetProvider,
  handleUpdateProvider,
  handleDeleteProvider,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleGetProvider);
export const PUT = withPermission('ai-providers:manage', handleUpdateProvider);
export const DELETE = withPermission('ai-providers:manage', handleDeleteProvider);