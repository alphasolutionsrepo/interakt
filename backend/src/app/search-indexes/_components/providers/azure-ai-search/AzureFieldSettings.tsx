// app/search-indexes/_components/providers/azure-ai-search/AzureFieldSettings.tsx

/**
 * Azure AI Search Per-Field Settings
 *
 * Renders the "Enable Sorting" toggle for sortable fields.
 * Registered in the provider UI registry and rendered dynamically.
 */

'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { ProviderFieldSettingsProps } from '../types';

// Field types that support sorting in Azure
const SORTABLE_FIELD_TYPES = new Set([
    'keyword', 'number', 'integer', 'long', 'float', 'double', 'boolean', 'date', 'datetime',
]);

export function AzureFieldSettings({ fieldType, value, onChange }: ProviderFieldSettingsProps) {
    // Only show sorting toggle for sortable field types
    if (!SORTABLE_FIELD_TYPES.has(fieldType)) {
        return null;
    }

    const isSortable = (value.isSortable as boolean) ?? false;

    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <div className="space-y-0.5">
                <Label className="text-sm font-medium">Sortable</Label>
                <p className="text-xs text-muted-foreground">
                    Allow sorting by this field (requires reindex)
                </p>
            </div>
            <Switch
                checked={isSortable}
                onCheckedChange={(checked) => onChange({ ...value, isSortable: checked })}
            />
        </div>
    );
}
