// app/search-indexes/_components/ExportImportButtons.tsx

/**
 * Export/Import Buttons for Search Indexes
 *
 * Provides UI for exporting search indexes and importing from JSON files.
 * - Export: Downloads search index configuration with all field mappings
 * - Import: Opens multi-step wizard for importing with template/AI config selection
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { useExportSearchIndex } from '../_lib/hooks/useSearchIndexExport';
import { ImportWizard } from './ImportWizard';

// ============================================================================
// TYPES
// ============================================================================

interface ExportImportButtonsProps {
    /** Search index ID (for export) */
    searchIndexId?: string;
    /** Search index name (for export filename) */
    searchIndexName?: string;
    /** Show only export button (for detail page) */
    exportOnly?: boolean;
    /** Show only import button (for list page) */
    importOnly?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ExportImportButtons({
    searchIndexId,
    searchIndexName,
    exportOnly = false,
    importOnly = false,
}: ExportImportButtonsProps) {
    const exportSearchIndex = useExportSearchIndex();
    const [importWizardOpen, setImportWizardOpen] = useState(false);

    const isExporting = exportSearchIndex.isPending;

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleExport = () => {
        if (!searchIndexId || !searchIndexName) return;
        exportSearchIndex.mutate({ id: searchIndexId, name: searchIndexName });
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <>
            <div className="flex gap-2">
                {/* Export Button */}
                {!importOnly && searchIndexId && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="rounded-xl"
                    >
                        {isExporting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Export
                    </Button>
                )}

                {/* Import Button */}
                {!exportOnly && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setImportWizardOpen(true)}
                        className="rounded-xl"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Import
                    </Button>
                )}
            </div>

            {/* Import Wizard Dialog */}
            <ImportWizard
                open={importWizardOpen}
                onOpenChange={setImportWizardOpen}
            />
        </>
    );
}
