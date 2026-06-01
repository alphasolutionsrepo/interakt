// app/search-indexes/_components/providers/azure-ai-search/AzureSettingsForm.tsx

/**
 * Azure AI Search Index Settings Form
 *
 * Renders vector algorithm, HNSW parameters, and semantic config settings.
 * Registered in the provider UI registry and rendered dynamically by StepSearchSettings.
 */

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Cloud } from 'lucide-react';
import type { ProviderSettingsFormProps } from '../types';

export function AzureSettingsForm({ value, onChange }: ProviderSettingsFormProps) {
    const vectorSearchAlgorithm = (value.vectorSearchAlgorithm as string) ?? 'hnsw';
    const hnswM = (value.hnswM as number) ?? 4;
    const hnswEfConstruction = (value.hnswEfConstruction as number) ?? 400;
    const hnswEfSearch = (value.hnswEfSearch as number) ?? 500;
    const semanticConfigName = (value.semanticConfigName as string) ?? 'default-semantic-config';

    const update = (key: string, val: unknown) => {
        onChange({ ...value, [key]: val });
    };

    const isHnsw = vectorSearchAlgorithm === 'hnsw';

    return (
        <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
            <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold text-foreground">Azure AI Search</Label>
            </div>

            {/* Vector Search Algorithm */}
            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                    Vector Search Algorithm
                </Label>
                <Select
                    value={vectorSearchAlgorithm}
                    onValueChange={(val) => update('vectorSearchAlgorithm', val)}
                >
                    <SelectTrigger className="h-10">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hnsw">HNSW (Approximate)</SelectItem>
                        <SelectItem value="exhaustiveKnn">Exhaustive KNN (Brute Force)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* HNSW Parameters (only shown when HNSW is selected) */}
            {isHnsw && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            M (Links)
                        </Label>
                        <Input
                            type="number"
                            value={hnswM}
                            onChange={(e) => update('hnswM', parseInt(e.target.value) || 4)}
                            min={4}
                            max={10}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            efConstruction
                        </Label>
                        <Input
                            type="number"
                            value={hnswEfConstruction}
                            onChange={(e) => update('hnswEfConstruction', parseInt(e.target.value) || 400)}
                            min={100}
                            max={1000}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            efSearch
                        </Label>
                        <Input
                            type="number"
                            value={hnswEfSearch}
                            onChange={(e) => update('hnswEfSearch', parseInt(e.target.value) || 500)}
                            min={100}
                            max={1000}
                            className="h-10"
                        />
                    </div>
                </div>
            )}

            {/* Semantic Configuration */}
            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                    Semantic Configuration Name
                </Label>
                <Input
                    value={semanticConfigName}
                    onChange={(e) => update('semanticConfigName', e.target.value)}
                    placeholder="default-semantic-config"
                    className="h-10"
                />
            </div>
        </div>
    );
}
