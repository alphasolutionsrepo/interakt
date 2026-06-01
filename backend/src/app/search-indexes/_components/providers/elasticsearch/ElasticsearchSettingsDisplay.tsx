// app/search-indexes/_components/providers/elasticsearch/ElasticsearchSettingsDisplay.tsx

/**
 * Elasticsearch Index Settings Display
 *
 * Read-only view of shards, replicas, and refresh interval for the index detail page.
 */

'use client';

import type { ProviderSettingsDisplayProps } from '../types';

export function ElasticsearchSettingsDisplay({ settings }: ProviderSettingsDisplayProps) {
    const numberOfShards = (settings.numberOfShards as number) ?? 1;
    const numberOfReplicas = (settings.numberOfReplicas as number) ?? 0;
    const refreshInterval = (settings.refreshInterval as string) ?? '1s';

    return (
        <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted/30 rounded-xl text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Shards</p>
                <p className="text-lg font-bold mt-1">{numberOfShards}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-xl text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Replicas</p>
                <p className="text-lg font-bold mt-1">{numberOfReplicas}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-xl text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Refresh</p>
                <p className="text-lg font-bold mt-1">{refreshInterval}</p>
            </div>
        </div>
    );
}
