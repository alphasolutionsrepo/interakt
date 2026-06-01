// app/search-indexes/_components/providers/elasticsearch/ElasticsearchSettingsForm.tsx

/**
 * Elasticsearch Index Settings Form
 *
 * Renders shards, replicas, and refresh interval controls.
 * This component is registered in the provider UI registry and
 * rendered dynamically by StepSearchSettings.
 */

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database } from 'lucide-react';
import type { ProviderSettingsFormProps } from '../types';

export function ElasticsearchSettingsForm({ value, onChange }: ProviderSettingsFormProps) {
    const numberOfShards = (value.numberOfShards as number) ?? 1;
    const numberOfReplicas = (value.numberOfReplicas as number) ?? 0;
    const refreshInterval = (value.refreshInterval as string) ?? '1s';

    const update = (key: string, val: unknown) => {
        onChange({ ...value, [key]: val });
    };

    return (
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
            <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold text-foreground">Elasticsearch</Label>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="es-numberOfShards" className="text-xs text-muted-foreground">
                        Shards
                    </Label>
                    <Input
                        id="es-numberOfShards"
                        type="number"
                        value={numberOfShards}
                        onChange={(e) => update('numberOfShards', parseInt(e.target.value) || 1)}
                        min={1}
                        max={100}
                        className="h-10 transition-colors focus-visible:border-primary focus-visible:ring-primary/20"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="es-numberOfReplicas" className="text-xs text-muted-foreground">
                        Replicas
                    </Label>
                    <Input
                        id="es-numberOfReplicas"
                        type="number"
                        value={numberOfReplicas}
                        onChange={(e) => update('numberOfReplicas', parseInt(e.target.value) || 0)}
                        min={0}
                        max={10}
                        className="h-10 transition-colors focus-visible:border-primary focus-visible:ring-primary/20"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="es-refreshInterval" className="text-xs text-muted-foreground">
                        Refresh
                    </Label>
                    <Input
                        id="es-refreshInterval"
                        placeholder="1s"
                        value={refreshInterval}
                        onChange={(e) => update('refreshInterval', e.target.value)}
                        className="h-10 transition-colors focus-visible:border-primary focus-visible:ring-primary/20"
                    />
                </div>
            </div>
        </div>
    );
}
