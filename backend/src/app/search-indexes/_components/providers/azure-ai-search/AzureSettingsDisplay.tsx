// app/search-indexes/_components/providers/azure-ai-search/AzureSettingsDisplay.tsx

/**
 * Azure AI Search Index Settings Display
 *
 * Read-only view of vector algorithm, HNSW parameters, and semantic config
 * for the index detail page.
 */

'use client';

import type { ProviderSettingsDisplayProps } from '../types';

export function AzureSettingsDisplay({ settings }: ProviderSettingsDisplayProps) {
    const algorithm = (settings.vectorSearchAlgorithm as string) ?? 'hnsw';
    const hnswM = (settings.hnswM as number) ?? 4;
    const hnswEfConstruction = (settings.hnswEfConstruction as number) ?? 400;
    const hnswEfSearch = (settings.hnswEfSearch as number) ?? 500;
    const semanticConfigName = (settings.semanticConfigName as string) ?? 'default-semantic-config';

    const isHnsw = algorithm === 'hnsw';

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/30 rounded-xl">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Algorithm</p>
                    <p className="text-sm font-semibold mt-1">
                        {isHnsw ? 'HNSW (Approximate)' : 'Exhaustive KNN'}
                    </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-xl">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Semantic Config</p>
                    <p className="text-sm font-semibold mt-1 truncate">{semanticConfigName}</p>
                </div>
            </div>
            {isHnsw && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-muted/30 rounded-xl text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">M (Links)</p>
                        <p className="text-lg font-bold mt-1">{hnswM}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-xl text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">efConstruction</p>
                        <p className="text-lg font-bold mt-1">{hnswEfConstruction}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-xl text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">efSearch</p>
                        <p className="text-lg font-bold mt-1">{hnswEfSearch}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
