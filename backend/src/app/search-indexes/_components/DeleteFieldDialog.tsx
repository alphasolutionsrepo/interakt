// app/search-indexes/_components/DeleteFieldDialog.tsx

/**
 * Delete Field Dialog
 *
 * Confirms removing a field from a search index, and refuses when something
 * references it.
 *
 * Two states once dependants have loaded:
 * - blocked: the things that depend on the field, with deletion disabled
 * - clear:   what deletion will and will not do, plus any advisory warnings
 */

'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Trash2,
    AlertTriangle,
    Loader2,
    Link2Off,
    Info,
    ShieldAlert,
} from 'lucide-react';
import { useFieldDependents, useDeleteField } from '../_lib/hooks';
import type { SearchIndexField } from '@/features/search-index';
import type { FieldDependent, FieldDependentKind } from '../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface DeleteFieldDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    searchIndexId: string;
    /** The field to delete. Null closes the dialog. */
    field: SearchIndexField | null;
    onDeleted?: () => void;
}

/** Grouping labels so a long list reads as categories, not a wall of rows. */
const DEPENDENT_GROUP_LABELS: Record<FieldDependentKind, string> = {
    'field-reference': 'Other fields in this index',
    'experience-display': 'Search experiences',
    'tool-display': 'Tool result rendering',
    'tool-executor': 'Tool configuration',
    'tool-override': 'AI experience overrides',
    'last-vector-source': 'Semantic search',
};

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function DependentList({ dependents }: { dependents: FieldDependent[] }) {
    // Preserve the order the groups are declared in, not first-seen order
    const kinds = (Object.keys(DEPENDENT_GROUP_LABELS) as FieldDependentKind[]).filter(kind =>
        dependents.some(dependent => dependent.kind === kind)
    );

    return (
        <div className="space-y-4">
            {kinds.map(kind => (
                <div key={kind} className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {DEPENDENT_GROUP_LABELS[kind]}
                    </p>
                    <ul className="space-y-1.5">
                        {dependents
                            .filter(dependent => dependent.kind === kind)
                            .map((dependent, index) => (
                                <li
                                    key={`${kind}-${index}`}
                                    className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                                >
                                    <span className="font-medium">{dependent.label}</span>{' '}
                                    <span className="text-muted-foreground">{dependent.detail}</span>
                                </li>
                            ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeleteFieldDialog({
    open,
    onOpenChange,
    searchIndexId,
    field,
    onDeleted,
}: DeleteFieldDialogProps) {
    const [submitError, setSubmitError] = useState<string | null>(null);

    const { data, isLoading, isError, error } = useFieldDependents(
        searchIndexId,
        open && field ? field.id : null
    );
    const deleteField = useDeleteField(searchIndexId);

    const dependents = data?.dependents ?? [];
    const warnings = data?.warnings ?? [];
    const canDelete = data?.canDelete ?? false;

    const handleOpenChange = (nextOpen: boolean) => {
        if (deleteField.isPending) return;
        if (!nextOpen) setSubmitError(null);
        onOpenChange(nextOpen);
    };

    const handleDelete = async () => {
        if (!field) return;

        setSubmitError(null);
        try {
            await deleteField.mutateAsync(field.id);
            onOpenChange(false);
            onDeleted?.();
        } catch (err) {
            // The server re-checks dependants, so it can reject even when the
            // dialog thought it was clear — surface that rather than closing.
            setSubmitError(err instanceof Error ? err.message : 'Failed to delete field');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Trash2 className="h-5 w-5 text-red-500" />
                        Delete field
                    </DialogTitle>
                    <DialogDescription>
                        {field ? (
                            <>
                                Remove{' '}
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                                    {field.fieldName}
                                </code>{' '}
                                from this index&apos;s configuration.
                            </>
                        ) : (
                            'Remove a field from this index.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[24rem] space-y-4 overflow-y-auto py-2">
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking what depends on this field…
                        </div>
                    )}

                    {isError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                                <p className="text-sm text-red-800">
                                    {error instanceof Error
                                        ? error.message
                                        : 'Could not check dependencies'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Blocked */}
                    {!isLoading && !isError && dependents.length > 0 && (
                        <>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <div className="flex gap-2">
                                    <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-medium">
                                            This field can&apos;t be deleted yet
                                        </p>
                                        <p className="mt-0.5 text-amber-700">
                                            {dependents.length}{' '}
                                            {dependents.length === 1 ? 'thing depends' : 'things depend'}{' '}
                                            on it. Remove{' '}
                                            {dependents.length === 1 ? 'that reference' : 'those references'}{' '}
                                            first, then try again.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <DependentList dependents={dependents} />
                        </>
                    )}

                    {/* Clear to delete */}
                    {!isLoading && !isError && canDelete && (
                        <>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <div className="flex gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-medium">What happens:</p>
                                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700">
                                            <li>
                                                The field stops being searched, faceted, and returned
                                                straight away
                                            </li>
                                            <li>
                                                Values already stored in the search provider remain
                                                until the index is rebuilt
                                            </li>
                                            <li>
                                                The index will be marked as needing a reindex — run{' '}
                                                <strong>Reindex</strong> to purge the stored values
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {warnings.length > 0 && (
                                <div className="space-y-2">
                                    {warnings.map((warning, index) => (
                                        <div
                                            key={index}
                                            className="rounded-lg border border-border/60 bg-muted/30 p-3"
                                        >
                                            <div className="flex gap-2">
                                                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                                <div className="text-sm">
                                                    <p className="font-medium">{warning.label}</p>
                                                    <p className="mt-0.5 text-muted-foreground">
                                                        {warning.detail}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {submitError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <div className="flex gap-2">
                                <Link2Off className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                                <p className="text-sm text-red-800">{submitError}</p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    {field?.isVectorSource && (
                        <Badge variant="outline" className="mr-auto self-center text-xs">
                            Vector source
                        </Badge>
                    )}
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={deleteField.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!canDelete || isLoading || deleteField.isPending}
                    >
                        {deleteField.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting…
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete field
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
