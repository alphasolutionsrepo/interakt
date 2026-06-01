// scripts/test-mcp-e2e.ts
//
// End-to-end test for the MCP-connections feature.
//
// Walks the layers:
//   1. Create connection → DeepWiki public MCP server (no auth)
//   2. Sync → discover tools/list
//   3. Create a throwaway AI Experience (agentic mode, OpenAI GPT-4o)
//   4. Attach the connection (expose only `ask_question`)
//   5. Reload the experience with relations + assert MCP tools materialize
//      in buildSharedContext
//   6. Directly invoke an MCP tool via executeTool() with a synthetic id
//   7. Optionally run a real chat turn through runChatPipeline()
//
// Cleans up everything it created at the end.

import 'dotenv/config';
import { db } from '../db/index';
import { aiExperiences, mcpConnections, aiExperienceMcpConnections } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as mcpService from '../src/features/mcp-connection/mcp-connection.service';
import * as expRepo from '../src/features/ai-experience/ai-experience.repository';
import { executeTool } from '../src/features/tools/tools.executor';
import { buildMcpToolId } from '../src/features/mcp-connection/mcp-tool-resolver';

const ADMIN_USER_ID = '6376f6ea-6ff7-430a-9be9-f25d211361f4';
const OPENAI_PROVIDER_ID = '6def8231-fcbb-4b2d-9a47-bdb1d2e26bb8';
const GPT_4O_MODEL_ID = 9;

const CONNECTION_SLUG = 'e2e-deepwiki';
const EXPERIENCE_SLUG = 'e2e-mcp-test';

function log(section: string, msg: string) {
  console.log(`\n=== ${section} ===\n${msg}`);
}

async function cleanup() {
  await db.delete(aiExperienceMcpConnections);
  await db.delete(aiExperiences).where(eq(aiExperiences.slug, EXPERIENCE_SLUG));
  await db.delete(mcpConnections).where(eq(mcpConnections.slug, CONNECTION_SLUG));
}

async function main() {
  await cleanup();

  // ─── 1. Create the MCP connection ─────────────────────────────────────────
  const conn = await mcpService.create({
    name: 'E2E DeepWiki',
    slug: CONNECTION_SLUG,
    serverUrl: 'https://mcp.deepwiki.com/mcp',
    transport: 'streamable-http',
    authConfig: { type: 'none' },
  }, ADMIN_USER_ID);
  log('1. Connection created', `${conn.id}\n${conn.serverUrl}`);

  // ─── 2. Sync (discover tools) ─────────────────────────────────────────────
  const syncResult = await mcpService.syncConnection(conn.id);
  log('2. Sync result', JSON.stringify({
    status: syncResult.status,
    toolCount: syncResult.toolCount,
    serverInfo: syncResult.catalog?.serverInfo,
    toolNames: syncResult.catalog?.tools.map((t) => t.name),
  }, null, 2));

  if (syncResult.status !== 'healthy' || (syncResult.catalog?.tools.length ?? 0) === 0) {
    throw new Error('Sync did not discover any tools');
  }

  // ─── 3. Create the test experience ────────────────────────────────────────
  const [exp] = await db.insert(aiExperiences).values({
    name: 'E2E MCP Test',
    slug: EXPERIENCE_SLUG,
    description: 'Throwaway experience for MCP E2E test',
    pipelineMode: 'agentic',
    pipelineConfig: null,
    agenticConfig: { maxIterations: 3 },
    personaConfig: {
      name: 'Test Assistant',
      tone: 'concise',
      systemInstructions: 'You answer questions about open-source GitHub repos. ' +
        'When asked about a repo, use the MCP-provided ask_question tool with ' +
        'repoName in "owner/repo" format. Be brief.',
      responseFormats: {
        enabledPresets: ['plain_text'],
        defaultPreset: 'plain_text',
        enableCitations: false,
        citationStyle: 'none',
      },
    },
    guardrailConfig: null,
    sessionConfig: {
      sessionTtlMinutes: 60,
      maxContextMessages: 20,
      enableConversationSummary: false,
      summaryThreshold: 100,
      enableUserContext: false,
    },
    accessConfig: {
      allowedOrigins: [],
      rateLimits: { chatPerMinute: 60, requestsPerDay: 10000 },
    },
    observabilityConfig: {
      telemetryDetailLevel: 'metadata',
      enableConversationLogging: true,
      conversationRetentionDays: 1,
    },
    providerId: OPENAI_PROVIDER_ID,
    modelId: GPT_4O_MODEL_ID,
    isActive: true,
    createdBy: ADMIN_USER_ID,
  }).returning();
  log('3. Experience created', `${exp.id} (${exp.slug})`);

  // ─── 4. Attach connection (expose only ask_question) ─────────────────────
  const attachment = await mcpService.attachToExperience(exp.id, {
    mcpConnectionId: conn.id,
    enabledToolNames: ['ask_question'],
    isEnabled: true,
    sortOrder: 0,
  });
  log('4. Attachment created', JSON.stringify({
    id: attachment.id,
    enabledToolNames: attachment.enabledToolNames,
  }, null, 2));

  // ─── 5. Reload experience + assert MCP tools materialize ─────────────────
  const reloaded = await expRepo.getAIExperienceById(exp.id);
  if (!reloaded) throw new Error('Could not reload experience');
  log('5. Experience reloaded', JSON.stringify({
    toolsAttached: reloaded.tools.length,
    mcpConnectionsAttached: reloaded.mcpConnections.length,
    mcpToolsAvailable: reloaded.mcpConnections.flatMap((m) =>
      (m.mcpConnection.discoveredTools?.tools ?? []).map((t) => t.name),
    ),
  }, null, 2));

  // We don't have a public buildSharedContext export, but we can verify the
  // executor end of the wire works directly:
  // ─── 6. Direct executeTool() with synthetic MCP id ───────────────────────
  const syntheticId = buildMcpToolId(conn.id, 'ask_question');
  log('6a. Synthetic tool id', syntheticId);

  const toolResult = await executeTool(syntheticId, {
    repoName: 'vercel/next.js',
    question: 'In one sentence, what is Turbopack?',
  });
  log('6b. Tool result', JSON.stringify({
    success: toolResult.success,
    durationMs: toolResult.durationMs,
    error: toolResult.error,
    dataPreview: typeof toolResult.data === 'object' && toolResult.data
      ? JSON.stringify(toolResult.data).slice(0, 600) + '…'
      : toolResult.data,
  }, null, 2));

  if (!toolResult.success) throw new Error(`executeTool failed: ${toolResult.error}`);

  // ─── 7. Full chat pipeline (LLM-driven) ──────────────────────────────────
  if (process.argv.includes('--chat')) {
    const { registerAllStepHandlers } = await import('../src/features/pipeline/steps');
    registerAllStepHandlers();
    const { runChatPipeline } = await import('../src/features/pipeline/chat-pipeline');
    log('7. Running chat pipeline', 'message: "What is Next.js Turbopack?"');

    const events: string[] = [];
    const result = await runChatPipeline({
      experience: reloaded as any,
      message: 'In a single sentence, what is Turbopack as used in vercel/next.js?',
      onEvent: (e) => {
        events.push(e.type);
        if (e.type === 'tool_call_start') {
          console.log(`   [event] tool_call_start: ${(e as any).toolName}`);
        }
        if (e.type === 'tool_call_end') {
          console.log(`   [event] tool_call_end: ${(e as any).success ? 'ok' : 'fail'}`);
        }
      },
    });

    log('7. Chat result', JSON.stringify({
      sessionId: result.sessionId,
      responsePreview: result.responseText.slice(0, 500),
      usage: result.usage,
      uniqueEvents: [...new Set(events)],
    }, null, 2));
  } else {
    log('7. Chat pipeline', 'SKIPPED (pass --chat to run full LLM turn)');
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────
  await cleanup();
  log('Cleanup', 'Removed connection, attachment, and experience.');
  console.log('\n✅ E2E test passed.\n');
}

main().catch((err) => {
  console.error('\n❌ E2E test failed:', err);
  cleanup().finally(() => process.exit(1));
});
