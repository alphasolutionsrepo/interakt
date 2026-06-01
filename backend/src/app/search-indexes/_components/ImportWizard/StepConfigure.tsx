// app/search-indexes/_components/ImportWizard/StepConfigure.tsx

/**
 * Step 2: Configure Settings
 *
 * Handles name conflict resolution.
 */

'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react';
import type { SearchIndexImportPreview } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface StepConfigureProps {
    preview: SearchIndexImportPreview;
    overrideName: string;
    setOverrideName: (name: string) => void;
    errors: Record<string, string>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepConfigure({
    preview,
    overrideName,
    setOverrideName,
    errors,
}: StepConfigureProps) {
    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="space-y-6">
            {/* Name Conflict Section */}
            {preview.searchIndex.nameConflict && (
                <div className="space-y-4 p-5 border-2 border-amber-500/30 bg-amber-500/5 rounded-xl">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-semibold text-amber-700 dark:text-amber-400">
                                Name Conflict Detected
                            </h4>
                            <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">
                                An index with the name <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-xs font-mono">{preview.searchIndex.name}</code> already exists.
                                Please provide a different name.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="override-name" className="font-medium">
                            New Index Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="override-name"
                            value={overrideName}
                            onChange={(e) => setOverrideName(e.target.value)}
                            placeholder="Enter a unique index name"
                            className={`rounded-xl h-11 ${
                                errors.overrideName
                                    ? 'border-destructive focus-visible:ring-destructive/30'
                                    : ''
                            }`}
                        />
                        <p className="text-xs text-muted-foreground">
                            Must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores.
                        </p>
                        {errors.overrideName && (
                            <p className="text-sm text-destructive font-medium">{errors.overrideName}</p>
                        )}
                    </div>
                </div>
            )}

            {/* No Conflict Notice */}
            {!preview.searchIndex.nameConflict && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            Index name available
                        </p>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                            The index will be created with name: <code className="bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono">{preview.searchIndex.name}</code>
                        </p>
                    </div>
                </div>
            )}

        </div>
    );
}
