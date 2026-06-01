// app/analytics/_components/QualityScore.tsx

'use client';

import { Card, CardContent } from '@/shared/ui/components/card';
import { cn } from '@/lib/utils';
import {
  calculateQualityScoreWithThresholds,
  getQualityScoreColor,
  getQualityScoreRingColor,
  getQualityScoreLabel,
  getQualityScoreBg,
} from '@/features/analytics/analytics-thresholds';

// ============================================================================
// SCORE CALCULATION
// ============================================================================

export function calculateQualityScore(
  zeroResultRate: number,
  avgResults: number,
  responseTimeMs: number
): number {
  return calculateQualityScoreWithThresholds(zeroResultRate, avgResults, responseTimeMs);
}

// ============================================================================
// COMPONENT
// ============================================================================

interface QualityScoreProps {
  score: number;
  successRate: number;
  avgResults: number;
  responseTimeMs: number;
  isLoading?: boolean;
}

export function QualityScore({
  score,
  successRate,
  avgResults,
  responseTimeMs,
  isLoading,
}: QualityScoreProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center justify-center p-8">
          <div className="h-32 w-32 rounded-full bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const circumference = 2 * Math.PI * 54; // radius = 54
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card className={cn('rounded-2xl border', getQualityScoreBg(score))}>
      <CardContent className="flex flex-col items-center p-6">
        {/* Circular gauge */}
        <div className="relative mb-3">
          <svg width="128" height="128" viewBox="0 0 128 128">
            {/* Background ring */}
            <circle
              cx="64" cy="64" r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted/30"
            />
            {/* Score ring */}
            <circle
              cx="64" cy="64" r="54"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={cn('transition-all duration-1000', getQualityScoreRingColor(score))}
              transform="rotate(-90 64 64)"
            />
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-3xl font-bold', getQualityScoreColor(score))}>{score}</span>
          </div>
        </div>

        <span className={cn('text-sm font-semibold mb-4', getQualityScoreColor(score))}>
          {getQualityScoreLabel(score)}
        </span>

        {/* Factor breakdown */}
        <div className="w-full space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Success Rate</span>
            <span className="font-medium">{(successRate * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Results</span>
            <span className="font-medium">{avgResults.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Response Time</span>
            <span className="font-medium">{responseTimeMs < 1000 ? `${Math.round(responseTimeMs)}ms` : `${(responseTimeMs / 1000).toFixed(1)}s`}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
