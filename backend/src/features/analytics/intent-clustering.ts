// src/features/analytics/intent-clustering.ts

/**
 * Intent Clustering
 *
 * Clusters user intents extracted from V2 pipeline plan.reasoning values.
 * Uses embedding-based agglomerative clustering with LLM-generated labels.
 */

import 'server-only';

import { generateEmbeddings , chat } from '@/features/ai-service/ai-service.service';
import { cosineSimilarity } from '@/features/embedding/vector-math';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('intent-clustering');

// ============================================================================
// TYPES
// ============================================================================

export interface IntentCluster {
  label: string;
  count: number;
  samples: string[];
  avgOutcomeSuccess: number;
  topQueries: string[];
}

export interface IntentClusteringResult {
  clusters: IntentCluster[];
  totalIntents: number;
  uniqueIntents: number;
  processingDurationMs: number;
}

interface ReasoningEntry {
  reasoning: string;
  outcome: string;
  userMessage?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SIMILARITY_THRESHOLD = 0.80;
const MAX_CLUSTERS = 30;
const MAX_SAMPLES_PER_CLUSTER = 5;
const MAX_INTENTS_TO_EMBED = 500;
const MIN_CLUSTER_SIZE = 2;

// ============================================================================
// MAIN CLUSTERING FUNCTION
// ============================================================================

/**
 * Cluster intent reasonings into semantic groups with LLM-generated labels.
 *
 * Steps:
 * 1. Deduplicate and normalize reasonings
 * 2. Batch embed unique reasonings
 * 3. Agglomerative clustering by cosine similarity
 * 4. Generate labels for top clusters via LLM
 */
export async function clusterIntents(
  entries: ReasoningEntry[]
): Promise<IntentClusteringResult> {
  const startTime = Date.now();

  if (entries.length === 0) {
    return {
      clusters: [],
      totalIntents: 0,
      uniqueIntents: 0,
      processingDurationMs: Date.now() - startTime,
    };
  }

  // Step 1: Deduplicate by normalized reasoning
  const { uniqueEntries, countMap } = deduplicateReasonings(entries);
  logger.info('Deduplicated intents', {
    total: entries.length,
    unique: uniqueEntries.length,
  });

  // If very few unique intents, skip embedding — return as individual clusters
  if (uniqueEntries.length <= 3) {
    const clusters = uniqueEntries.map((entry) => ({
      label: entry.reasoning.slice(0, 60),
      count: countMap.get(normalizeReasoning(entry.reasoning)) || 1,
      samples: [entry.reasoning],
      avgOutcomeSuccess: entry.outcome === 'success' ? 1 : 0,
      topQueries: entry.userMessage ? [entry.userMessage] : [],
    }));

    return {
      clusters,
      totalIntents: entries.length,
      uniqueIntents: uniqueEntries.length,
      processingDurationMs: Date.now() - startTime,
    };
  }

  // Step 2: Sample if too many unique intents
  const sampled =
    uniqueEntries.length > MAX_INTENTS_TO_EMBED
      ? sampleEntries(uniqueEntries, MAX_INTENTS_TO_EMBED)
      : uniqueEntries;

  // Step 3: Embed all unique reasonings
  const texts = sampled.map((e) => e.reasoning);
  let embeddingVectors: (number[] | null)[];

  try {
    const result = await generateEmbeddings(texts, {
      feature: 'intent-clustering',
    });
    // EmbeddingBatchResult.embeddings is EmbeddingResult[] with .vector
    embeddingVectors = result.embeddings.map((e) => e.vector ?? null);
  } catch (error) {
    logger.error('Failed to generate embeddings for clustering', { error });
    // Fallback: return top entries ungrouped
    return buildFallbackResult(entries, uniqueEntries, startTime);
  }

  // Filter out entries where embedding failed
  const validPairs: { entry: ReasoningEntry; embedding: number[] }[] = [];
  for (let i = 0; i < sampled.length; i++) {
    if (embeddingVectors[i]) {
      validPairs.push({ entry: sampled[i], embedding: embeddingVectors[i]! });
    }
  }

  if (validPairs.length === 0) {
    logger.warn('No valid embeddings produced');
    return buildFallbackResult(entries, uniqueEntries, startTime);
  }

  // Step 4: Agglomerative clustering
  const clusterAssignments = agglomerativeCluster(
    validPairs.map((p) => p.embedding),
    SIMILARITY_THRESHOLD
  );

  // Step 5: Build cluster groups
  const clusterGroups = new Map<
    number,
    { entries: ReasoningEntry[]; embeddings: number[][] }
  >();
  for (let i = 0; i < validPairs.length; i++) {
    const clusterId = clusterAssignments[i];
    if (!clusterGroups.has(clusterId)) {
      clusterGroups.set(clusterId, { entries: [], embeddings: [] });
    }
    const group = clusterGroups.get(clusterId)!;
    group.entries.push(validPairs[i].entry);
    group.embeddings.push(validPairs[i].embedding);
  }

  // Step 6: Build cluster objects with counts from dedup map
  const rawClusters: {
    entries: ReasoningEntry[];
    totalCount: number;
    avgSuccess: number;
  }[] = [];

  for (const group of clusterGroups.values()) {
    let totalCount = 0;
    let successCount = 0;

    for (const entry of group.entries) {
      const normalized = normalizeReasoning(entry.reasoning);
      const entryCount = countMap.get(normalized) || 1;
      totalCount += entryCount;
      if (entry.outcome === 'success') {
        successCount += entryCount;
      }
    }

    rawClusters.push({
      entries: group.entries,
      totalCount,
      avgSuccess: totalCount > 0 ? successCount / totalCount : 0,
    });
  }

  // Sort by count descending, take top clusters
  rawClusters.sort((a, b) => b.totalCount - a.totalCount);
  const topClusters = rawClusters
    .filter((c) => c.totalCount >= MIN_CLUSTER_SIZE)
    .slice(0, MAX_CLUSTERS);

  // Step 7: Generate labels via LLM
  const clusters = await generateClusterLabels(topClusters, countMap);

  return {
    clusters,
    totalIntents: entries.length,
    uniqueIntents: uniqueEntries.length,
    processingDurationMs: Date.now() - startTime,
  };
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

function normalizeReasoning(reasoning: string): string {
  return reasoning.toLowerCase().trim().replace(/\s+/g, ' ');
}

function deduplicateReasonings(entries: ReasoningEntry[]): {
  uniqueEntries: ReasoningEntry[];
  countMap: Map<string, number>;
} {
  const countMap = new Map<string, number>();
  const seen = new Map<string, ReasoningEntry>();

  for (const entry of entries) {
    const normalized = normalizeReasoning(entry.reasoning);
    countMap.set(normalized, (countMap.get(normalized) || 0) + 1);
    if (!seen.has(normalized)) {
      seen.set(normalized, entry);
    }
  }

  return {
    uniqueEntries: Array.from(seen.values()),
    countMap,
  };
}

// ============================================================================
// SAMPLING
// ============================================================================

function sampleEntries(
  entries: ReasoningEntry[],
  maxCount: number
): ReasoningEntry[] {
  if (entries.length <= maxCount) return entries;

  // Reservoir sampling for uniform distribution
  const result = entries.slice(0, maxCount);
  for (let i = maxCount; i < entries.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < maxCount) {
      result[j] = entries[i];
    }
  }
  return result;
}

// ============================================================================
// AGGLOMERATIVE CLUSTERING
// ============================================================================

/**
 * Simple agglomerative clustering using cosine similarity.
 * Returns an array of cluster IDs (one per input vector).
 */
function agglomerativeCluster(
  vectors: number[][],
  threshold: number
): number[] {
  const n = vectors.length;
  const assignments = new Array(n).fill(0).map((_, i) => i);

  // Build similarity matrix (upper triangle only)
  const merges: { i: number; j: number; sim: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= threshold) {
        merges.push({ i, j, sim });
      }
    }
  }

  // Sort by similarity descending (merge most similar first)
  merges.sort((a, b) => b.sim - a.sim);

  // Union-find for efficient merging
  const parent = new Array(n).fill(0).map((_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) {
      parent[py] = px;
    }
  }

  // Merge pairs above threshold
  for (const merge of merges) {
    union(merge.i, merge.j);
  }

  // Normalize cluster IDs
  const clusterMap = new Map<number, number>();
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, nextId++);
    }
    assignments[i] = clusterMap.get(root)!;
  }

  return assignments;
}

// ============================================================================
// LABEL GENERATION
// ============================================================================

async function generateClusterLabels(
  clusters: {
    entries: ReasoningEntry[];
    totalCount: number;
    avgSuccess: number;
  }[],
  countMap: Map<string, number>
): Promise<IntentCluster[]> {
  if (clusters.length === 0) return [];

  // Build prompt with all clusters for batch labeling
  const clusterDescriptions = clusters.map((cluster, idx) => {
    const samples = cluster.entries
      .slice(0, 4)
      .map((e) => e.reasoning)
      .join('\n  - ');
    return `Cluster ${idx + 1} (${cluster.totalCount} occurrences):\n  - ${samples}`;
  });

  const prompt = `You are labeling groups of user intent classifications from an AI shopping assistant. Each cluster contains similar intents.

Generate a short label (2-5 words) for each cluster that captures the common theme. Labels should be business-meaningful (e.g., "Hockey Equipment Search", "Size & Fit Questions", "Brand Comparison").

${clusterDescriptions.join('\n\n')}

Respond with a JSON array of labels, one per cluster, in order. Example: ["Hockey Equipment Search", "Size Questions"]`;

  let labels: string[];

  try {
    const result = await chat(
      [
        { role: 'system', content: 'You generate concise, business-meaningful labels for intent clusters. Respond only with a JSON array of strings.' },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.1,
        maxTokens: 500,
        feature: 'intent-cluster-labeling',
      }
    );

    const rawContent = result.message.content;
    const content = typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text).join('').trim()
        : String(rawContent).trim();
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      labels = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON array in response');
    }
  } catch (error) {
    logger.warn('Failed to generate cluster labels via LLM, using fallback', {
      error,
    });
    // Fallback: use first reasoning text truncated
    labels = clusters.map(
      (c) => c.entries[0]?.reasoning.slice(0, 40) || 'Unknown Intent'
    );
  }

  // Build final cluster objects
  return clusters.map((cluster, idx) => {
    const userMessages = cluster.entries
      .filter((e) => e.userMessage)
      .map((e) => e.userMessage!)
      .slice(0, 5);

    return {
      label: labels[idx] || `Cluster ${idx + 1}`,
      count: cluster.totalCount,
      samples: cluster.entries
        .slice(0, MAX_SAMPLES_PER_CLUSTER)
        .map((e) => e.reasoning),
      avgOutcomeSuccess: Math.round(cluster.avgSuccess * 100) / 100,
      topQueries: userMessages,
    };
  });
}

// ============================================================================
// FALLBACK
// ============================================================================

function buildFallbackResult(
  allEntries: ReasoningEntry[],
  uniqueEntries: ReasoningEntry[],
  startTime: number
): IntentClusteringResult {
  // Group by exact normalized text when embeddings fail
  const groups = new Map<string, { entries: ReasoningEntry[]; count: number }>();

  for (const entry of allEntries) {
    const normalized = normalizeReasoning(entry.reasoning);
    if (!groups.has(normalized)) {
      groups.set(normalized, { entries: [], count: 0 });
    }
    const group = groups.get(normalized)!;
    group.entries.push(entry);
    group.count++;
  }

  const sorted = Array.from(groups.values()).sort(
    (a, b) => b.count - a.count
  );

  const clusters: IntentCluster[] = sorted.slice(0, MAX_CLUSTERS).map((group) => {
    const successCount = group.entries.filter(
      (e) => e.outcome === 'success'
    ).length;
    return {
      label: group.entries[0].reasoning.slice(0, 60),
      count: group.count,
      samples: [group.entries[0].reasoning],
      avgOutcomeSuccess:
        group.count > 0 ? Math.round((successCount / group.count) * 100) / 100 : 0,
      topQueries: group.entries
        .filter((e) => e.userMessage)
        .map((e) => e.userMessage!)
        .slice(0, 5),
    };
  });

  return {
    clusters,
    totalIntents: allEntries.length,
    uniqueIntents: uniqueEntries.length,
    processingDurationMs: Date.now() - startTime,
  };
}
