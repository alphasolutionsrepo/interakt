// app/analytics/_components/AIUsageCard.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Badge } from '@/shared/ui/components/badge';
import { Bot, MessageSquare, FileText, Cpu } from 'lucide-react';
import type { AIUsageMetrics } from '../_lib/hooks/useAnalytics';

interface AIUsageCardProps {
  data?: AIUsageMetrics;
  isLoading?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function AIUsageCard({ data, isLoading }: AIUsageCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Usage</CardTitle>
          <CardDescription>Token usage and estimated costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const operations = [
    {
      name: 'Text Generation',
      count: data.byOperation.text,
      icon: FileText,
      color: 'text-blue-500',
    },
    {
      name: 'Chat',
      count: data.byOperation.chat,
      icon: MessageSquare,
      color: 'text-green-500',
    },
    {
      name: 'Embeddings',
      count: data.byOperation.embedding,
      icon: Cpu,
      color: 'text-purple-500',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Usage
        </CardTitle>
        <CardDescription>Token usage and estimated costs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Main stats */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Requests</p>
              <p className="text-2xl font-bold">{formatNumber(data.totalRequests)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Est. Cost</p>
              <p className="text-2xl font-bold">
                {formatCost(data.estimatedCostUsd)}
                <Badge variant="outline" className="ml-2 text-xs">
                  estimate
                </Badge>
              </p>
            </div>
          </div>

          {/* Token breakdown */}
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="mb-2 text-sm font-medium">Token Usage</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground">Input</p>
                <p className="font-medium">{formatNumber(data.inputTokens)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Output</p>
                <p className="font-medium">{formatNumber(data.outputTokens)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total</p>
                <p className="font-medium">{formatNumber(data.totalTokens)}</p>
              </div>
            </div>
          </div>

          {/* Operation breakdown */}
          <div>
            <h4 className="mb-3 text-sm font-medium">By Operation</h4>
            <div className="space-y-2">
              {operations.map((op) => (
                <div key={op.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <op.icon className={`h-4 w-4 ${op.color}`} />
                    <span className="text-sm">{op.name}</span>
                  </div>
                  <span className="font-medium">{formatNumber(op.count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
