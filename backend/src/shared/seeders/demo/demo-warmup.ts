// src/shared/seeders/demo/demo-warmup.ts

/**
 * Analytics / traces warm-up.
 *
 * Replays the manifest's demo-script queries through the SAME service
 * functions the public API calls — search.searchById() and
 * pipeline.runChatPipeline() — so the Analytics, Chat Analytics, and Traces
 * screens are populated the moment the presenter opens the Admin Console.
 *
 * Both functions record analytics + OTel spans as a side effect, so no extra
 * wiring is needed beyond flushing telemetry at the end. Everything here is
 * best-effort: a warm-up failure never fails the seed (the demo is already
 * configured by the time this runs).
 *
 * Prerequisite: the caller must have initialized search providers + pipeline
 * step handlers + telemetry (the CLI does this).
 */

import 'server-only';
import type { LoadedDemoManifest } from './demo-manifest';
import type { SeedProgressEvent } from './demo-steps';

import { getAIExperienceBySlug } from '@/features/ai-experience/ai-experience.service';
import { runChatPipeline } from '@/features/pipeline/chat-pipeline';
import { searchById } from '@/features/search/search.service';
import { getSearchExperienceBySlug } from '@/features/search-experience/search-experience.service';
import { getSearchIndexByName } from '@/features/search-index/search-index.service';
import { flushTelemetry } from '@/features/telemetry';
import { createLogger } from '@/shared/logger/logger';


const logger = createLogger('demo-warmup');

export interface WarmupSummary {
  searchesRun: number;
  chatTurnsRun: number;
  analyticsChatTurnsRun: number;
}

export async function runWarmup(
  loaded: LoadedDemoManifest,
  onProgress?: (event: SeedProgressEvent) => void,
): Promise<WarmupSummary> {
  const { manifest } = loaded;
  const warmup = manifest.warmup;
  let searchesRun = 0;
  let chatTurnsRun = 0;
  let analyticsChatTurnsRun = 0;

  // Emit the warm-up step's running tally; the UI keeps the node active while
  // status === 'start' and updates its detail line as the counts climb.
  const tally = () =>
    `${searchesRun} searches · ${chatTurnsRun} chat turns · ${analyticsChatTurnsRun} analytics turns`;
  const emit = (status: SeedProgressEvent['status'], detail: string) =>
    onProgress?.({ step: 'warmup', status, detail });

  if (!warmup.enabled) {
    logger.info('Warm-up disabled in manifest — skipping');
    return { searchesRun, chatTurnsRun, analyticsChatTurnsRun };
  }

  emit('start', 'Replaying demo-script queries…');

  // ---- Searches -----------------------------------------------------------
  const index = await getSearchIndexByName(manifest.index.name);
  const searchExp = await getSearchExperienceBySlug(manifest.searchExperience.slug);
  if (index && searchExp && warmup.searches.length) {
    logger.info('Replaying search queries', { count: warmup.searches.length });
    for (const query of warmup.searches) {
      try {
        await searchById(
          index.id,
          { query, pageSize: 10 },
          { source: 'api', experienceId: searchExp.id, experienceSlug: searchExp.slug },
        );
        searchesRun++;
        emit('start', tally());
      } catch (e) {
        logger.warn('Warm-up search failed (non-fatal)', { query, error: (e as Error).message });
      }
    }
  }

  // ---- Chats --------------------------------------------------------------
  const experience = await getAIExperienceBySlug(manifest.chatExperience.slug);
  if (experience && warmup.chats.length) {
    logger.info('Replaying chat conversations', { conversations: warmup.chats.length });
    for (const turns of warmup.chats) {
      let sessionId: string | undefined;
      for (const message of turns) {
        try {
          const result = await runChatPipeline({
            experience,
            message,
            sessionId,
            analyticsSource: 'api',
            onEvent: () => {}, // discard stream events
          });
          sessionId = result.sessionId; // thread the conversation
          chatTurnsRun++;
          emit('start', tally());
        } catch (e) {
          logger.warn('Warm-up chat turn failed (non-fatal)', { message, error: (e as Error).message });
          break; // abandon this conversation, move to the next
        }
      }
    }
  }

  // Flush the customer search/chat spans, then aggregate them into the views
  // the Analytics screens read. Aggregation is driven by OTel spans, so it only
  // produces data when ENABLE_OTEL=true; with OTel off it's a harmless no-op
  // (the raw search/chat events are still recorded).
  await safeFlush();
  try {
    const { runAnalyticsProcessing } = await import('@/features/analytics/analytics-processing.service');
    await runAnalyticsProcessing();
  } catch (e) {
    logger.warn('Analytics processing failed (non-fatal)', { error: (e as Error).message });
  }

  // ---- Analytics Chat (admin) --------------------------------------------
  // The "Chat Analytics" admin page lists Analytics-Chat sessions — an admin
  // asking questions ABOUT the analytics. Run a few against the now-populated
  // data so that page isn't empty. Each conversation becomes a session row.
  if (warmup.analyticsChats.length) {
    const { runAnalyticsPipeline } = await import('@/features/analytics/pipeline/analytics-pipeline-orchestrator');
    logger.info('Replaying analytics-chat conversations', { conversations: warmup.analyticsChats.length });
    for (const turns of warmup.analyticsChats) {
      let sessionId: string | undefined;
      for (const message of turns) {
        try {
          const result = await runAnalyticsPipeline({ message, sessionId }, () => {});
          sessionId = result.sessionId; // thread the conversation
          analyticsChatTurnsRun++;
          emit('start', tally());
        } catch (e) {
          logger.warn('Warm-up analytics-chat turn failed (non-fatal)', { message, error: (e as Error).message });
          break;
        }
      }
    }
    // Flush the spans produced by the analytics-chat turns too.
    await safeFlush();
  }

  emit('done', tally());
  logger.info('Warm-up complete', { searchesRun, chatTurnsRun, analyticsChatTurnsRun });
  return { searchesRun, chatTurnsRun, analyticsChatTurnsRun };
}

async function safeFlush(): Promise<void> {
  try {
    await flushTelemetry();
  } catch (e) {
    logger.warn('flushTelemetry failed (non-fatal)', { error: (e as Error).message });
  }
}
