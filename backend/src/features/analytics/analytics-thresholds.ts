// src/features/analytics/analytics-thresholds.ts

/**
 * Analytics Threshold Configuration
 *
 * Centralizes all metric thresholds and color-coding logic.
 * Uses ANALYTICS_ENV to determine whether to apply strict (production)
 * or relaxed (development) thresholds.
 *
 * In development, thresholds are significantly relaxed because:
 * - Cheaper/slower models inflate response times
 * - Limited test data inflates zero-result rates
 * - Local infra doesn't match production performance
 */

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

export type AnalyticsEnv = 'development' | 'production';

export function getAnalyticsEnv(): AnalyticsEnv {
  const env = process.env.ANALYTICS_ENV ?? process.env.NODE_ENV;
  return env === 'production' ? 'production' : 'development';
}

// ============================================================================
// THRESHOLD TYPES
// ============================================================================

export interface LatencyThresholds {
  excellent: number;  // ms — green
  good: number;       // ms — blue
  acceptable: number; // ms — amber
  // anything above acceptable = red
}

export interface DurationThresholds {
  fast: number;   // ms — green
  normal: number; // ms — yellow
  // anything above normal = red
}

export interface RateThresholds {
  healthy: number;  // below this = green
  warning: number;  // above this = amber
  critical: number; // above this = red
}

export interface ScoreThresholds {
  excellent: number; // above this = green
  good: number;      // above this = amber
  // below good = red
}

export interface QualityScoreWeights {
  speedExcellent: number;   // ms boundary for full speed points
  speedGood: number;
  speedAcceptable: number;
  speedExcellentPoints: number;
  speedGoodPoints: number;
  speedAcceptablePoints: number;
  speedPoorPoints: number;
}

export interface AnalyticsThresholds {
  /** Search/API latency (PerformanceCard, AnalyticsDataRenderer) */
  latency: LatencyThresholds;

  /** Conversation/span duration (SpanList) */
  duration: DurationThresholds;

  /** Error rate (SpanMetricsBar) */
  errorRate: RateThresholds;

  /** Zero result rate (OverviewCards) */
  zeroResultRate: RateThresholds;

  /** Real zero result rate - catalog health (AnalyticsDataRenderer) */
  realZeroResultRate: RateThresholds;

  /** AI success/effectiveness rate (AnalyticsDataRenderer) */
  successRate: ScoreThresholds;

  /** Intent cluster success rate (AnalyticsDataRenderer) */
  intentSuccessRate: ScoreThresholds;

  /** Quality score color boundaries */
  qualityScore: ScoreThresholds;

  /** Quality score speed weights */
  qualityScoreSpeed: QualityScoreWeights;

  /** Proactive insights thresholds */
  insights: {
    zeroResultWarning: number;
    zeroResultCritical: number;
    retryRateWarning: number;
    successRateCritical: number;
    successRateWarning: number;
    guardrailBlockWarning: number;
    guardrailBlockInfo: number;
    directResponseInfo: number;
    retryWasteWarning: number;
    retryWasteInfo: number;
    contentGapWarning: number;
    clusterFailureThreshold: number;
    clusterMinCount: number;
  };
}

// ============================================================================
// PRODUCTION THRESHOLDS (strict - real infra)
// ============================================================================

const PRODUCTION_THRESHOLDS: AnalyticsThresholds = {
  latency: {
    excellent: 100,
    good: 300,
    acceptable: 500,
  },
  duration: {
    fast: 1000,
    normal: 3000,
  },
  errorRate: {
    healthy: 5,
    warning: 15,
    critical: 15, // same as warning for error rate (binary)
  },
  zeroResultRate: {
    healthy: 0.10,
    warning: 0.10,
    critical: 0.25,
  },
  realZeroResultRate: {
    healthy: 0.05,
    warning: 0.15,
    critical: 0.25,
  },
  successRate: {
    excellent: 0.70,
    good: 0.50,
  },
  intentSuccessRate: {
    excellent: 0.70,
    good: 0.40,
  },
  qualityScore: {
    excellent: 80,
    good: 60,
  },
  qualityScoreSpeed: {
    speedExcellent: 200,
    speedGood: 500,
    speedAcceptable: 1000,
    speedExcellentPoints: 30,
    speedGoodPoints: 25,
    speedAcceptablePoints: 15,
    speedPoorPoints: 5,
  },
  insights: {
    zeroResultWarning: 0.15,
    zeroResultCritical: 0.25,
    retryRateWarning: 0.3,
    successRateCritical: 0.5,
    successRateWarning: 0.7,
    guardrailBlockWarning: 0.2,
    guardrailBlockInfo: 0.1,
    directResponseInfo: 0.6,
    retryWasteWarning: 0.3,
    retryWasteInfo: 0.15,
    contentGapWarning: 10,
    clusterFailureThreshold: 0.5,
    clusterMinCount: 3,
  },
};

// ============================================================================
// DEVELOPMENT THRESHOLDS (relaxed - cheap models, local infra)
// ============================================================================

const DEVELOPMENT_THRESHOLDS: AnalyticsThresholds = {
  latency: {
    excellent: 500,
    good: 1500,
    acceptable: 3000,
  },
  duration: {
    fast: 10000,
    normal: 30000,
  },
  errorRate: {
    healthy: 15,
    warning: 30,
    critical: 30,
  },
  zeroResultRate: {
    healthy: 0.30,
    warning: 0.30,
    critical: 0.60,
  },
  realZeroResultRate: {
    healthy: 0.20,
    warning: 0.40,
    critical: 0.60,
  },
  successRate: {
    excellent: 0.40,
    good: 0.20,
  },
  intentSuccessRate: {
    excellent: 0.40,
    good: 0.20,
  },
  qualityScore: {
    excellent: 60,
    good: 40,
  },
  qualityScoreSpeed: {
    speedExcellent: 500,
    speedGood: 1500,
    speedAcceptable: 3000,
    speedExcellentPoints: 30,
    speedGoodPoints: 25,
    speedAcceptablePoints: 15,
    speedPoorPoints: 5,
  },
  insights: {
    zeroResultWarning: 0.40,
    zeroResultCritical: 0.60,
    retryRateWarning: 0.6,
    successRateCritical: 0.2,
    successRateWarning: 0.4,
    guardrailBlockWarning: 0.4,
    guardrailBlockInfo: 0.25,
    directResponseInfo: 0.8,
    retryWasteWarning: 0.5,
    retryWasteInfo: 0.3,
    contentGapWarning: 25,
    clusterFailureThreshold: 0.3,
    clusterMinCount: 5,
  },
};

// ============================================================================
// ACCESSOR
// ============================================================================

let _cachedThresholds: AnalyticsThresholds | null = null;
let _cachedEnv: AnalyticsEnv | null = null;

export function getThresholds(): AnalyticsThresholds {
  const env = getAnalyticsEnv();
  if (_cachedThresholds && _cachedEnv === env) return _cachedThresholds;

  _cachedThresholds = env === 'production' ? PRODUCTION_THRESHOLDS : DEVELOPMENT_THRESHOLDS;
  _cachedEnv = env;
  return _cachedThresholds;
}

// ============================================================================
// COLOR HELPERS (shared across UI components)
// ============================================================================

/** Latency → bar color class */
export function getLatencyColor(ms: number, t = getThresholds()): string {
  if (ms <= t.latency.excellent) return 'bg-green-500';
  if (ms <= t.latency.good) return 'bg-blue-500';
  if (ms <= t.latency.acceptable) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Span/conversation duration → text color class */
export function getDurationColor(ms: number, t = getThresholds()): string {
  if (ms < t.duration.fast) return 'text-green-600 dark:text-green-400';
  if (ms < t.duration.normal) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/** Error rate (percentage) → text color class */
export function getErrorRateColor(rate: number, t = getThresholds()): string {
  if (rate < t.errorRate.healthy) return 'text-green-600';
  if (rate <= t.errorRate.warning) return 'text-yellow-600';
  return 'text-red-600';
}

/** Zero result rate → icon + color for OverviewCards */
export function getZeroResultStatus(rate: number, t = getThresholds()): { isWarning: boolean } {
  return { isWarning: rate > t.zeroResultRate.warning };
}

/** Real zero result rate → text color class */
export function getRealZeroResultColor(rate: number, t = getThresholds()): string {
  if (rate > t.realZeroResultRate.critical) return 'text-red-600';
  if (rate > t.realZeroResultRate.healthy) return 'text-amber-600';
  return 'text-green-600';
}

/** Success/effectiveness rate → text color class */
export function getSuccessRateColor(rate: number, t = getThresholds()): string {
  if (rate >= t.successRate.excellent) return 'text-green-600';
  return 'text-amber-600';
}

/** Intent cluster success → border + bg class */
export function getIntentSuccessStyle(rate: number, t = getThresholds()): string {
  if (rate >= t.intentSuccessRate.excellent) return 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20';
  if (rate >= t.intentSuccessRate.good) return 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20';
  return 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20';
}

/** Quality score → text color */
export function getQualityScoreColor(score: number, t = getThresholds()): string {
  if (score >= t.qualityScore.excellent) return 'text-green-600 dark:text-green-400';
  if (score >= t.qualityScore.good) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/** Quality score → ring stroke color */
export function getQualityScoreRingColor(score: number, t = getThresholds()): string {
  if (score >= t.qualityScore.excellent) return 'stroke-green-500';
  if (score >= t.qualityScore.good) return 'stroke-amber-500';
  return 'stroke-red-500';
}

/** Quality score → label text */
export function getQualityScoreLabel(score: number, t = getThresholds()): string {
  if (score >= t.qualityScore.excellent) return 'Excellent';
  if (score >= t.qualityScore.good) return 'Good';
  if (score >= (t.qualityScore.good + t.qualityScore.excellent) / 3) return 'Needs Improvement';
  return 'Poor';
}

/** Quality score → background color */
export function getQualityScoreBg(score: number, t = getThresholds()): string {
  if (score >= t.qualityScore.excellent) return 'bg-green-50 dark:bg-green-950/30';
  if (score >= t.qualityScore.good) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-red-50 dark:bg-red-950/30';
}

/** Calculate quality score with env-aware speed thresholds */
export function calculateQualityScoreWithThresholds(
  zeroResultRate: number,
  avgResults: number,
  responseTimeMs: number,
  t = getThresholds()
): number {
  const successScore = (1 - Math.min(zeroResultRate, 1)) * 40;

  const avgResultsScore =
    avgResults >= 5 && avgResults <= 20
      ? 30
      : avgResults > 0 && avgResults < 5
        ? 20
        : avgResults > 20
          ? 25
          : 0;

  const s = t.qualityScoreSpeed;
  const speedScore =
    responseTimeMs < s.speedExcellent
      ? s.speedExcellentPoints
      : responseTimeMs < s.speedGood
        ? s.speedGoodPoints
        : responseTimeMs < s.speedAcceptable
          ? s.speedAcceptablePoints
          : s.speedPoorPoints;

  return Math.round(successScore + avgResultsScore + speedScore);
}
