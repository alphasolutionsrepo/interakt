// src/features/mcp-connection/mcp-connection.validation.ts

import { z } from 'zod';

export const MCP_TRANSPORTS = ['streamable-http', 'sse'] as const;
export const MCP_AUTH_TYPES = ['none', 'bearer', 'header'] as const;
export const MCP_CONNECTION_STATUSES = ['healthy', 'degraded', 'error', 'unknown'] as const;

const authConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('bearer'),
    secretRef: z.string().min(1, 'secretRef is required for bearer auth'),
  }),
  z.object({
    type: z.literal('header'),
    secretRef: z.string().min(1, 'secretRef is required for header auth'),
    headerName: z.string().min(1, 'headerName is required for header auth'),
  }),
]);

export const createMcpConnectionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string()
    .min(1).max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only'),
  description: z.string().max(1000).nullish().transform((v) => v ?? undefined),
  serverUrl: z.string().url(),
  transport: z.enum(MCP_TRANSPORTS).default('streamable-http'),
  authConfig: authConfigSchema.optional(),
});

export type CreateMcpConnectionDTO = z.infer<typeof createMcpConnectionSchema>;

export const updateMcpConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish().transform((v) => v ?? undefined),
  serverUrl: z.string().url().optional(),
  transport: z.enum(MCP_TRANSPORTS).optional(),
  authConfig: authConfigSchema.optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).some((k) => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateMcpConnectionDTO = z.infer<typeof updateMcpConnectionSchema>;

export const listMcpConnectionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().max(255).nullish().transform((v) => v ?? undefined),
  status: z.enum(MCP_CONNECTION_STATUSES).optional(),
  isActive: z.enum(['true', 'false']).optional().transform((v) =>
    v === 'true' ? true : v === 'false' ? false : undefined,
  ),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListMcpConnectionsQuery = z.infer<typeof listMcpConnectionsQuerySchema>;

// ─── Experience attachment DTOs ─────────────────────────────────────────────

export const attachConnectionSchema = z.object({
  mcpConnectionId: z.string().uuid(),
  enabledToolNames: z.array(z.string()).nullable().optional(),
  isEnabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export type AttachConnectionDTO = z.infer<typeof attachConnectionSchema>;

export const updateAttachmentSchema = z.object({
  enabledToolNames: z.array(z.string()).nullable().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).refine(
  (data) => Object.keys(data).some((k) => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateAttachmentDTO = z.infer<typeof updateAttachmentSchema>;
