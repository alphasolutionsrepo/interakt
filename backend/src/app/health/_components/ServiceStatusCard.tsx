// app/health/_components/ServiceStatusCard.tsx

'use client';

import { CheckCircle2, AlertTriangle, XCircle, Clock, Database, Search, Zap, Cpu, Activity, Info, ExternalLink, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ServiceHealth } from '../_lib/api-client';

interface ServiceStatusCardProps {
  service: ServiceHealth;
  index?: number;
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  'Database (PostgreSQL)': Database,
  'Elasticsearch': Search,
  'AI Providers': Zap,
  'Memory': Cpu,
  'Application': Activity,
};

const SERVICE_MONITORING_INFO: Record<string, { what: string; how: string; thresholds: string }> = {
  'Database (PostgreSQL)': {
    what: 'PostgreSQL database connectivity and query performance',
    how: 'Executes a test query (SELECT 1) and measures response time',
    thresholds: 'Healthy: <500ms | Degraded: 500-1000ms | Unhealthy: >1000ms or connection failure',
  },
  'Elasticsearch': {
    what: 'Elasticsearch cluster availability and API responsiveness',
    how: 'Calls cluster health API endpoint and measures response time. For query testing, use the Playground.',
    thresholds: 'Healthy: Green cluster & <1000ms | Degraded: Yellow cluster or 1000-2000ms | Unhealthy: Red cluster, >2000ms, or connection failure',
  },
  'AI Providers': {
    what: 'AI provider availability via official status pages and API endpoints',
    how: 'Cloud providers (OpenAI, Anthropic): Checks official status page APIs. Local providers (Ollama): Tests local API endpoint. For real token-based testing, use the Playground.',
    thresholds: 'Healthy: All providers operational | Degraded: Some providers have issues | Unhealthy: All providers unreachable',
  },
  'Memory': {
    what: 'Node.js process memory usage',
    how: 'Monitors heap memory usage percentage',
    thresholds: 'Healthy: <75% heap | Degraded: 75-90% heap | Unhealthy: >90% heap',
  },
  'Application': {
    what: 'Application uptime and system information',
    how: 'Reports process uptime and Node.js version',
    thresholds: 'Always healthy - informational only',
  },
};

export function ServiceStatusCard({ service, index = 0 }: ServiceStatusCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = SERVICE_ICONS[service.name] || Activity;
  const monitoringInfo = SERVICE_MONITORING_INFO[service.name];

  // Staggered animation entrance
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100 + index * 100);
    return () => clearTimeout(timer);
  }, [index]);

  const statusConfig = {
    healthy: {
      icon: CheckCircle2,
      iconColor: 'text-green-600 dark:text-green-400',
      badgeColor: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700',
      statusIconBg: 'bg-green-100 dark:bg-green-900/50',
      label: 'Healthy',
      pulse: false,
    },
    degraded: {
      icon: AlertTriangle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
      statusIconBg: 'bg-amber-100 dark:bg-amber-900/50',
      label: 'Degraded',
      pulse: true,
    },
    unhealthy: {
      icon: XCircle,
      iconColor: 'text-red-600 dark:text-red-400',
      badgeColor: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700',
      statusIconBg: 'bg-red-100 dark:bg-red-900/50',
      label: 'Unhealthy',
      pulse: true,
    },
  };

  const config = statusConfig[service.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={`rounded-2xl border border-border/60 bg-card transition-all duration-500 hover:shadow-xl hover:scale-[1.02] ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/60">
        <div className="flex items-start gap-4 mb-3">
          <div className="p-3.5 bg-muted/50 rounded-2xl shrink-0">
            <Icon className="size-8 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-bold text-xl truncate">{service.name}</h3>
              {monitoringInfo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="shrink-0 p-1.5 hover:bg-primary/10 rounded-lg transition-colors group/info">
                      <Info className="size-5 text-primary/70 group-hover/info:text-primary transition-colors" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <div className="space-y-2">
                      <div>
                        <p className="font-semibold mb-0.5">What we monitor:</p>
                        <p className="text-xs opacity-90">{monitoringInfo.what}</p>
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">How we check:</p>
                        <p className="text-xs opacity-90">{monitoringInfo.how}</p>
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">Health thresholds:</p>
                        <p className="text-xs opacity-90">{monitoringInfo.thresholds}</p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1 flex items-center gap-2">
              <Badge variant="outline" className={`${config.badgeColor} text-xs px-2 py-0.5 font-semibold`}>
                {config.label}
              </Badge>
              <span className="truncate">{service.message}</span>
            </p>
          </div>

          {/* Animated Status Icon */}
          <div className={`${config.statusIconBg} p-3 rounded-xl shrink-0 relative`}>
            <StatusIcon className={`size-7 ${config.iconColor} ${config.pulse ? 'animate-pulse' : ''}`} />
            {config.pulse && (
              <span className="absolute inset-0 rounded-xl animate-ping opacity-20">
                <StatusIcon className={`size-7 ${config.iconColor}`} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-6 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2.5">
            <Clock className="size-5" />
            <span className="font-medium">Response Time</span>
          </span>
          <span className="font-bold text-lg tabular-nums">{service.responseTime}ms</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2.5">
            <Activity className="size-5" />
            <span className="font-medium">Last Checked</span>
          </span>
          <span className="font-semibold text-sm">
            {formatDistanceToNow(new Date(service.lastChecked), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Details */}
      {service.details && Object.keys(service.details).length > 0 && (
        <div className="px-6 pb-6 pt-3 border-t border-border/60">
          <p className="text-sm font-bold text-foreground/80 mb-4">Service Details</p>

          {/* Special handling for AI Providers - show individual provider status */}
          {service.name === 'AI Providers' && Array.isArray(service.details.providers) ? (
            <div className="space-y-2">
              {(service.details.providers as Array<{ name: string; key: string; healthy: boolean; message: string; responseTimeMs: number; endpointTested?: string }>).map((provider) => (
                <div
                  key={provider.key}
                  className={`p-3 rounded-xl border ${
                    provider.healthy
                      ? 'bg-green-50/50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                      : 'bg-red-50/50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {provider.healthy ? (
                        <CheckCircle2 className="size-5 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <XCircle className="size-5 text-red-600 dark:text-red-400 shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-sm">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.message}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {provider.responseTimeMs}ms
                    </span>
                  </div>
                  {provider.endpointTested && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <p className="text-xs text-muted-foreground font-mono truncate" title={provider.endpointTested}>
                        {provider.endpointTested}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {/* Playground link for real testing */}
              <div className="mt-4 pt-3 border-t border-border/40">
                <Link
                  href="/playground/ai-service"
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <FlaskConical className="size-4" />
                  <span>Test with real API calls in Playground</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Object.entries(service.details).slice(0, 8).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <div className="text-xs text-muted-foreground capitalize truncate mb-1">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="font-bold text-sm truncate tabular-nums">
                    {typeof value === 'number' ? value.toLocaleString() : String(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
