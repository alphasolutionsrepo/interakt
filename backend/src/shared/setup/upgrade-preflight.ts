// src/shared/setup/upgrade-preflight.ts

/**
 * Upgrade preflight — report configuration that no longer does anything.
 *
 * Chat used to run on two engines: a deterministic pipeline and a separate
 * step-based agentic pipeline. They are now one engine, with autonomy expressed
 * as an ExecutionPolicy. Two kinds of stored configuration became inert in that
 * change, and both fail *silently* — the experience keeps working, it just stops
 * honouring something an operator deliberately set:
 *
 *   1. `pipelineConfig` — a hand-authored step composition. The API still accepts
 *      and stores it; nothing reads it. Arbitrary step ordering has no equivalent
 *      in a fixed pipeline, so it cannot be migrated automatically. (The one
 *      mappable field, settings.maxTotalDurationMs, is migrated by 0028.)
 *
 *   2. `agentic_loop` prompt template overrides — that step no longer runs, so a
 *      custom template for it is never resolved. The equivalent guidance now
 *      belongs on the `turn_planner` step.
 *
 * Silence would be the wrong behavior here: an operator who tuned a step list
 * deserves to be told it is being ignored rather than discovering it from a
 * behavior change. This runs once at boot and only logs — it never mutates data
 * and never blocks startup.
 */

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('upgrade-preflight');

export interface PreflightFinding {
  /** Stable identifier for the finding type. */
  code:
    | 'inert_pipeline_config'
    | 'inert_agentic_loop_override'
    | 'unmigrated_agentic_config'
    | 'stale_planner_template';
  /** Human-readable explanation including what to do about it. */
  message: string;
  /** Affected experience slugs, capped for log readability. */
  slugs: string[];
  /** Total affected count, which may exceed `slugs.length`. */
  count: number;
}

const MAX_SLUGS_LOGGED = 10;

/**
 * Inspect stored configuration for anything the unified pipeline ignores.
 * Returns findings rather than logging them directly so this is testable and so
 * callers can surface findings in the UI later.
 */
export async function collectUpgradeFindings(): Promise<PreflightFinding[]> {
  const { db } = await import('@/db/index');
  const { sql } = await import('drizzle-orm');
  const findings: PreflightFinding[] = [];

  // 1. Experiences carrying a step composition nothing executes.
  const pipelineRows = await db.execute(sql`
    SELECT slug FROM ai_experiences
    WHERE pipeline_config IS NOT NULL
      AND jsonb_array_length(COALESCE(pipeline_config::jsonb -> 'steps', '[]'::jsonb)) > 0
    ORDER BY slug
  `);
  const pipelineSlugs = extractSlugs(pipelineRows);
  if (pipelineSlugs.length > 0) {
    findings.push({
      code: 'inert_pipeline_config',
      count: pipelineSlugs.length,
      slugs: pipelineSlugs.slice(0, MAX_SLUGS_LOGGED),
      message:
        'These experiences have a custom pipelineConfig step list, which the unified chat pipeline does not execute. ' +
        'Their turn timeout was migrated to executionPolicy.maxTurnDurationMs; any custom step ordering is no longer applied. ' +
        'Review each experience and express the intent as an execution policy (planning rounds, tool ceiling, tool allowlist) instead.',
    });
  }

  // 2. Prompt overrides for a step that no longer runs.
  const overrideRows = await db.execute(sql`
    SELECT e.slug FROM ai_experience_prompt_overrides o
    JOIN ai_experiences e ON e.id = o.ai_experience_id
    WHERE o.step = 'agentic_loop'
    ORDER BY e.slug
  `);
  const overrideSlugs = extractSlugs(overrideRows);
  if (overrideSlugs.length > 0) {
    findings.push({
      code: 'inert_agentic_loop_override',
      count: overrideSlugs.length,
      slugs: overrideSlugs.slice(0, MAX_SLUGS_LOGGED),
      message:
        'These experiences override the agentic_loop prompt template, which is no longer resolved — that step was retired with the second engine. ' +
        'Move the guidance to a turn_planner override to keep it in effect.',
    });
  }

  // 3. Safety net: agenticConfig that migration 0027 should have converted.
  // A hit here means the data migration did not run, so autonomy limits an
  // operator set are being ignored in favour of preset defaults.
  const unmigratedRows = await db.execute(sql`
    SELECT slug FROM ai_experiences
    WHERE agentic_config IS NOT NULL
      AND agentic_config ->> 'maxIterations' ~ '^[0-9]+$'
      AND (execution_policy IS NULL OR execution_policy::jsonb -> 'maxToolCallsPerTurn' IS NULL)
    ORDER BY slug
  `);
  const unmigratedSlugs = extractSlugs(unmigratedRows);
  if (unmigratedSlugs.length > 0) {
    findings.push({
      code: 'unmigrated_agentic_config',
      count: unmigratedSlugs.length,
      slugs: unmigratedSlugs.slice(0, MAX_SLUGS_LOGGED),
      message:
        'These experiences still carry agenticConfig.maxIterations without a corresponding executionPolicy tool budget. ' +
        'Migration 0028 (backfill_execution_policy) appears not to have run — apply migrations, or their tool budget will fall back to the preset default.',
    });
  }

  // 4. A system default the operator promoted themselves, which a newer shipped
  // default has since superseded.
  //
  // seedSystemDefaults() upgrades shipped defaults automatically by creating a new
  // version and promoting it — but only when nobody chose the current one. Seeded
  // rows carry no createdBy; a version promoted through the UI does. Overwriting
  // the latter would discard a deliberate decision, so it is reported instead.
  const operatorOwnedRows = await db.execute(sql`
    SELECT step FROM prompt_templates
    WHERE is_system_default = true
      AND created_by IS NOT NULL
      AND step = 'turn_planner'
      AND content NOT LIKE '%toolWorkflow%'
  `);
  const operatorOwned = extractColumn(operatorOwnedRows, 'step');
  if (operatorOwned.length > 0) {
    findings.push({
      code: 'stale_planner_template',
      count: operatorOwned.length,
      slugs: operatorOwned.slice(0, MAX_SLUGS_LOGGED),
      message:
        'The system default for these prompt steps was promoted manually, and a newer shipped default exists that ' +
        'they predate — so it was left untouched rather than overwriting your choice. Tool-sequencing guidance still ' +
        'applies (the planner appends it when a template omits it), but you cannot control its placement. ' +
        'To adopt the new default, add {{toolWorkflow}} and {{personaInstructions}} to your version in ' +
        'Prompt Templates, or roll back to a seeded version and restart to pick up the upgrade automatically.',
    });
  }

  return findings;
}

/**
 * Drizzle's execute() return shape differs between drivers (array vs { rows }).
 * Normalize rather than assume, so this cannot break on a driver swap.
 */
function extractColumn(result: unknown, column: string): string[] {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] })?.rows ?? []);
  return rows
    .map((r) => (r as Record<string, unknown>)?.[column])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

const extractSlugs = (result: unknown): string[] => extractColumn(result, 'slug');

/**
 * Run the preflight and log any findings. Never throws — a reporting aid must not
 * be able to prevent the app from starting.
 */
export async function runUpgradePreflight(): Promise<void> {
  try {
    const findings = await collectUpgradeFindings();
    if (findings.length === 0) {
      logger.debug('Upgrade preflight found no inert configuration');
      return;
    }

    for (const finding of findings) {
      logger.warn(`Upgrade notice: ${finding.message}`, {
        code: finding.code,
        affectedCount: finding.count,
        experiences: finding.slugs,
        ...(finding.count > finding.slugs.length
          ? { note: `showing ${finding.slugs.length} of ${finding.count}` }
          : {}),
      });
    }
  } catch (error) {
    // A missing table (fresh install, migrations not yet applied) is expected and
    // uninteresting — log at debug so it never looks like a real problem.
    const message = error instanceof Error ? error.message : String(error);
    logger.debug('Upgrade preflight skipped', { reason: message });
  }
}
