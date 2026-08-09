// app/search-indexes/_components/DocumentManager/DocumentManagerPanel.tsx

/**
 * Document Manager Panel
 *
 * Inspect and remove documents from a search index:
 * - Browse the index page by page, expanding a row to see the whole document
 * - Look up a document by its id (the mapped uniqueId value)
 * - Delete either one, behind a confirmation
 * - Delete many at once by filter, previewing the count and a sample first
 */

'use client';

import { Fragment, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
    Search,
    Trash2,
    AlertCircle,
    Loader2,
    FileText,
    Filter,
    Eye,
    Rows3,
    ChevronRight,
    ChevronDown,
    ChevronLeft,
    Check,
    X,
    Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeUrl, safeMailto } from '@/shared/utils/safe-url';
import {
    useBrowseDocuments,
    useDocument,
    useDeleteDocument,
    useDeleteDocumentsByFilter,
    useSearchIndexFields,
} from '../../_lib/hooks';
import type {
    DocumentColumnDescriptor,
    DocumentSummary,
    EmbeddingPreview,
} from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentManagerPanelProps {
    searchIndexId: string;
}

/** Operators offered in the filter builder, with the value input they need. */
const FILTER_OPERATORS = [
    { value: 'eq', label: 'equals', needsValue: true },
    { value: 'neq', label: 'not equals', needsValue: true },
    { value: 'gt', label: 'greater than', needsValue: true },
    { value: 'gte', label: 'greater than or equal', needsValue: true },
    { value: 'lt', label: 'less than', needsValue: true },
    { value: 'lte', label: 'less than or equal', needsValue: true },
    { value: 'contains', label: 'contains', needsValue: true },
    { value: 'prefix', label: 'starts with', needsValue: true },
    { value: 'exists', label: 'exists', needsValue: false },
    { value: 'missing', label: 'is missing', needsValue: false },
] as const;

// ============================================================================
// HELPERS
// ============================================================================

/** Rows per browse page. */
const BROWSE_PAGE_SIZE = 25;

/** How many matching documents the delete-by-filter preview asks for. */
const PREVIEW_SAMPLE_SIZE = 25;

/**
 * Coerce the raw text from the value input into the type the filter needs.
 *
 * Filter values are typed at the provider level — sending "42" where a number is
 * expected produces a filter that silently matches nothing.
 */
function coerceFilterValue(raw: string): string | number | boolean {
    const trimmed = raw.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return raw;
}

/**
 * Render a field value as a single table cell's worth of text.
 *
 * Objects and arrays get JSON-stringified rather than becoming "[object Object]";
 * the expanded row shows the real structure.
 */
function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Stop a link or control inside a row from also toggling the row's expansion. */
function stopRowToggle(event: React.MouseEvent) {
    event.stopPropagation();
}

/**
 * Format a date value for a table cell, keeping the exact value in the tooltip.
 *
 * Anything unparseable falls back to the raw string — a malformed date in an index
 * is worth seeing verbatim, not hiding behind "Invalid Date".
 */
function formatDateCell(value: unknown): { text: string; title: string } {
    const raw = String(value);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return { text: raw, title: raw };
    }
    return { text: parsed.toLocaleString(), title: raw };
}

/**
 * Summarise an array in one cell: a couple of primitive values, or a count.
 *
 * A tags array is worth reading inline; an array of objects is not, so it
 * collapses to "N items" and leaves the detail to the expanded row.
 */
function summariseArray(values: unknown[]): string {
    if (values.length === 0) return 'empty';
    if (values.some(entry => entry !== null && typeof entry === 'object')) {
        return `${values.length} item${values.length === 1 ? '' : 's'}`;
    }
    const shown = values.slice(0, 2).map(String).join(', ');
    return values.length > 2 ? `${shown} +${values.length - 2}` : shown;
}

/**
 * A document's image field as a thumbnail, falling back to the URL text.
 *
 * A broken image icon says nothing useful about the document; the URL that failed
 * to load is exactly what someone inspecting a bad document needs to see.
 */
function ThumbnailCell({ url }: { url: string }) {
    const [failed, setFailed] = useState(false);

    // A document controls this URL, and an <img src> fetches from whatever host it
    // names as soon as the row renders — before any click. Anything that is not a
    // web URL degrades to the same text fallback a broken image already uses.
    const src = safeUrl(url);

    if (failed || !src) {
        return <span className="text-xs text-muted-foreground" title={url}>{url}</span>;
    }

    return (
        // next/image is not usable here: document image URLs point at arbitrary
        // remote hosts and next.config declares no images.remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            title={url}
            className="h-8 w-8 rounded border object-cover"
            onError={() => setFailed(true)}
        />
    );
}

/**
 * Render one document field according to its declared type.
 *
 * The index already knows what each field holds, so a cell can show a thumbnail,
 * a followable link or a formatted date instead of a stringified value. Cells are
 * summaries by design — the expanded row still shows the raw document, so
 * anything collapsed here is one click from being seen in full.
 */
function DocumentCell({
    value,
    type,
}: {
    value: unknown;
    type: DocumentColumnDescriptor['type'];
}) {
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">—</span>;
    }

    switch (type) {
        case 'boolean': {
            const truthy = value === true || value === 'true';
            return truthy
                ? <Check className="h-4 w-4 text-emerald-600" aria-label="true" />
                : <X className="h-4 w-4 text-muted-foreground" aria-label="false" />;
        }

        case 'number': {
            const numeric = typeof value === 'number' ? value : Number(value);
            return (
                <span className="tabular-nums">
                    {Number.isNaN(numeric) ? String(value) : numeric.toLocaleString()}
                </span>
            );
        }

        case 'date':
        case 'datetime': {
            const { text, title } = formatDateCell(value);
            return <span className="whitespace-nowrap" title={title}>{text}</span>;
        }

        case 'image_url':
            return <ThumbnailCell url={String(value)} />;

        // url and email validate differently, so they no longer share a branch.
        case 'url': {
            const href = safeUrl(String(value));
            if (!href) {
                return <span title={String(value)}>{String(value)}</span>;
            }
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={stopRowToggle}
                    className="text-primary underline-offset-2 hover:underline"
                    title={String(value)}
                >
                    {String(value)}
                </a>
            );
        }

        case 'email': {
            const href = safeMailto(String(value));
            if (!href) {
                return <span title={String(value)}>{String(value)}</span>;
            }
            return (
                <a
                    href={href}
                    onClick={stopRowToggle}
                    className="text-primary underline-offset-2 hover:underline"
                    title={String(value)}
                >
                    {String(value)}
                </a>
            );
        }

        case 'array':
            return (
                <Badge variant="secondary" className="font-normal" title={JSON.stringify(value)}>
                    {Array.isArray(value) ? summariseArray(value) : formatCellValue(value)}
                </Badge>
            );

        case 'json':
            return (
                <Badge variant="secondary" className="font-normal" title={JSON.stringify(value)}>
                    {'{…}'}
                </Badge>
            );

        default:
            return <span title={formatCellValue(value)}>{formatCellValue(value)}</span>;
    }
}

/**
 * A document table shared by the browse card and the delete-by-filter preview,
 * so both present documents the same way.
 *
 * When `onRowClick` is given, rows become interactive and `expandedId` renders an
 * extra row underneath with the full document.
 */
function DocumentTable({
    documents,
    columns,
    expandedId,
    onRowClick,
    renderExpanded,
}: {
    documents: DocumentSummary[];
    columns: DocumentColumnDescriptor[];
    expandedId?: string | null;
    onRowClick?: (documentId: string) => void;
    renderExpanded?: (document: DocumentSummary) => React.ReactNode;
}) {
    const interactive = !!onRowClick;
    // +1 for the chevron column when rows can expand
    const totalColumns = columns.length + (interactive ? 1 : 0);

    return (
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {interactive && <TableHead className="w-8" />}
                        {columns.map(column => (
                            <TableHead key={column.field}>{column.label}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {documents.map(document => {
                        const isExpanded = expandedId === document.id;

                        return (
                            <Fragment key={document.id}>
                                <TableRow
                                    onClick={onRowClick ? () => onRowClick(document.id) : undefined}
                                    className={interactive ? 'cursor-pointer' : undefined}
                                    data-state={isExpanded ? 'selected' : undefined}
                                >
                                    {interactive && (
                                        <TableCell className="text-muted-foreground">
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </TableCell>
                                    )}
                                    {columns.map((column, columnIndex) => (
                                        <TableCell
                                            key={column.field}
                                            className={
                                                columnIndex === 0
                                                    ? 'font-mono text-xs'
                                                    : 'max-w-[18rem] truncate'
                                            }
                                        >
                                            {columnIndex === 0
                                                ? document.id
                                                : (
                                                    <DocumentCell
                                                        value={document.fields[column.field]}
                                                        type={column.type}
                                                    />
                                                )}
                                        </TableCell>
                                    ))}
                                </TableRow>

                                {isExpanded && renderExpanded && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={totalColumns} className="bg-muted/30 p-4">
                                            {renderExpanded(document)}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function BrowseDocuments({ searchIndexId }: { searchIndexId: string }) {
    const [page, setPage] = useState(1);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const { data, isLoading, isError, error } = useBrowseDocuments(
        searchIndexId,
        page,
        BROWSE_PAGE_SIZE
    );
    const deleteDocument = useDeleteDocument(searchIndexId);

    const pagination = data?.pagination;
    const documents = data?.documents ?? [];

    const handleDelete = async () => {
        if (!pendingDeleteId) return;

        try {
            await deleteDocument.mutateAsync(pendingDeleteId);
            toast.success(`Document "${pendingDeleteId}" deleted`);
            setPendingDeleteId(null);
            setExpandedId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete document');
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Rows3 className="h-4 w-4 text-emerald-500" />
                        Browse documents
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} className="h-10 w-full rounded-md" />
                    ))}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Rows3 className="h-4 w-4 text-emerald-500" />
                    Browse documents
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Page through what is actually in the index. Click a row to see the whole document.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {isError && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {error instanceof Error ? error.message : 'Failed to load documents'}
                        </AlertDescription>
                    </Alert>
                )}

                {!isError && documents.length === 0 && (
                    <div className="py-10 text-center">
                        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-muted/50">
                            <FileText className="size-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground">This index has no documents yet</p>
                    </div>
                )}

                {documents.length > 0 && (
                    <>
                        <DocumentTable
                            documents={documents}
                            columns={data?.columns ?? []}
                            expandedId={expandedId}
                            onRowClick={id => setExpandedId(current => (current === id ? null : id))}
                            renderExpanded={document => (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className="font-mono">
                                            {document.id}
                                        </Badge>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => setPendingDeleteId(document.id)}
                                            disabled={deleteDocument.isPending}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete document
                                        </Button>
                                    </div>
                                    <ScrollArea className="h-64 rounded-md border bg-background">
                                        <pre className="p-4 text-xs">
                                            {JSON.stringify(document.fields, null, 2)}
                                        </pre>
                                    </ScrollArea>
                                </div>
                            )}
                        />

                        {pagination && (
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Showing{' '}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {(pagination.page - 1) * pagination.pageSize + 1}
                                    </span>
                                    –
                                    <span className="font-medium tabular-nums text-foreground">
                                        {Math.min(
                                            pagination.page * pagination.pageSize,
                                            pagination.totalItems
                                        )}
                                    </span>{' '}
                                    of{' '}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {pagination.totalItems.toLocaleString()}
                                    </span>
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setExpandedId(null);
                                            setPage(p => Math.max(1, p - 1));
                                        }}
                                        disabled={pagination.page === 1}
                                    >
                                        <ChevronLeft className="mr-1 h-4 w-4" />
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setExpandedId(null);
                                            setPage(p => p + 1);
                                        }}
                                        disabled={pagination.page >= pagination.totalPages}
                                    >
                                        Next
                                        <ChevronRight className="ml-1 h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                <ConfirmationDialog
                    open={pendingDeleteId !== null}
                    onOpenChange={open => {
                        if (!open) setPendingDeleteId(null);
                    }}
                    title="Delete this document?"
                    description={`Document "${pendingDeleteId}" will be removed from the search index. This cannot be undone — re-adding it requires uploading it again.`}
                    actionLabel="Delete"
                    variant="destructive"
                    loading={deleteDocument.isPending}
                    onConfirm={handleDelete}
                />
            </CardContent>
        </Card>
    );
}

/**
 * Why a field contributed nothing, in words — the three causes have three
 * different fixes, so they must not read the same.
 */
const EXCLUSION_HINTS: Record<string, string> = {
    missing: 'No value on this document — check the ingest data or the field mapping',
    empty: 'A value exists but is blank, e.g. an empty list',
    'unsupported-type': 'Objects and lists of objects cannot be embedded — this field will never contribute',
};

/**
 * Show exactly the text this document's vector was built from.
 *
 * The stored vector is stripped from every read and a bad one is
 * indistinguishable from a good one, so the text is the only visible evidence of
 * why a document does or does not match semantically. Excluded fields are listed
 * rather than hidden: a vector-source field contributing nothing — a json blob,
 * an empty array — is exactly the kind of thing that quietly ruins a result set.
 */
function EmbeddingPreviewPanel({ preview }: { preview: EmbeddingPreview }) {
    const included = preview.parts.filter(part => part.included);
    const excluded = preview.parts.filter(part => !part.included);

    return (
        <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium">Embedded text</span>
                <Badge variant="secondary" className="font-normal">
                    {preview.totalChars.toLocaleString()} chars
                </Badge>
                <Badge variant="secondary" className="font-normal">
                    {included.length} of {preview.parts.length} fields
                </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
                This exact string was sent to the embedding model. Fields appear in
                boost order — earlier text carries more weight.
            </p>

            <ScrollArea className="h-56 rounded-md border bg-muted/30">
                <pre className="whitespace-pre-wrap break-words p-4 text-xs">
                    {preview.text || '(empty — this document has no vector)'}
                </pre>
            </ScrollArea>

            {excluded.length > 0 && (
                <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                        Contributing nothing
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {excluded.map(part => (
                            <Badge
                                key={part.fieldName}
                                variant="outline"
                                className="font-normal text-xs"
                                title={EXCLUSION_HINTS[part.excludedBecause ?? 'missing']}
                            >
                                {part.label}
                                <span className="ml-1 text-muted-foreground">
                                    {part.excludedBecause}
                                </span>
                            </Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function DocumentLookup({ searchIndexId }: { searchIndexId: string }) {
    const [inputValue, setInputValue] = useState('');
    // Only set once the user submits, so we don't fetch on every keystroke
    const [lookupId, setLookupId] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { data, isLoading, error } = useDocument(searchIndexId, lookupId);
    const deleteDocument = useDeleteDocument(searchIndexId);

    const handleLookup = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) {
            toast.error('Enter a document ID');
            return;
        }
        setLookupId(trimmed);
    };

    const handleDelete = async () => {
        if (!lookupId) return;

        try {
            await deleteDocument.mutateAsync(lookupId);
            toast.success(`Document "${lookupId}" deleted`);
            setConfirmOpen(false);
            setLookupId(null);
            setInputValue('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete document');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Find a document
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Look up a document by its ID — the value of this index&apos;s mapped{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">uniqueId</code> field,
                    often a source-system ID such as a SKU.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLookup();
                        }}
                        placeholder="e.g. SKU-10432"
                        className="font-mono"
                    />
                    <Button onClick={handleLookup} disabled={isLoading}>
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Search className="h-4 w-4" />
                        )}
                        <span className="ml-2">Look up</span>
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {error instanceof Error ? error.message : 'Document not found'}
                        </AlertDescription>
                    </Alert>
                )}

                {data && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Badge variant="outline" className="font-mono">
                                {data.documentId}
                            </Badge>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setConfirmOpen(true)}
                                disabled={deleteDocument.isPending}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete document
                            </Button>
                        </div>
                        <ScrollArea className="h-72 rounded-md border bg-muted/30">
                            <pre className="p-4 text-xs">
                                {JSON.stringify(data.document, null, 2)}
                            </pre>
                        </ScrollArea>

                        {data.embeddingPreview && (
                            <EmbeddingPreviewPanel preview={data.embeddingPreview} />
                        )}
                    </div>
                )}

                <ConfirmationDialog
                    open={confirmOpen}
                    onOpenChange={setConfirmOpen}
                    title="Delete this document?"
                    description={`Document "${lookupId}" will be removed from the search index. This cannot be undone — re-adding it requires uploading it again.`}
                    actionLabel="Delete"
                    variant="destructive"
                    loading={deleteDocument.isPending}
                    onConfirm={handleDelete}
                />
            </CardContent>
        </Card>
    );
}

function DeleteByFilter({ searchIndexId }: { searchIndexId: string }) {
    const [field, setField] = useState('');
    const [operator, setOperator] = useState<string>('eq');
    const [value, setValue] = useState('');
    const [preview, setPreview] = useState<{
        matched: number;
        sample: DocumentSummary[];
        columns: DocumentColumnDescriptor[];
    } | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { data: fields } = useSearchIndexFields(searchIndexId);
    const deleteByFilter = useDeleteDocumentsByFilter(searchIndexId);

    // Only indexed fields can be filtered on (see validateFilterableField)
    const filterableFields = (fields ?? []).filter(f => f.isIndexed);
    const selectedOperator = FILTER_OPERATORS.find(op => op.value === operator);
    const needsValue = selectedOperator?.needsValue ?? true;

    const buildFilters = () => [{
        field,
        operator,
        ...(needsValue ? { value: coerceFilterValue(value) } : {}),
    }];

    const isIncomplete = !field || (needsValue && value.trim() === '');

    const handlePreview = async () => {
        if (isIncomplete) {
            toast.error('Choose a field and enter a value');
            return;
        }

        try {
            const result = await deleteByFilter.mutateAsync({
                filters: buildFilters(),
                dryRun: true,
                sampleSize: PREVIEW_SAMPLE_SIZE,
            });
            setPreview({
                matched: result.matched,
                sample: result.sample ?? [],
                columns: result.columns ?? [],
            });
            if (result.matched === 0) {
                toast.info('No documents match this filter');
            }
        } catch (err) {
            setPreview(null);
            toast.error(err instanceof Error ? err.message : 'Preview failed');
        }
    };

    const handleDelete = async () => {
        try {
            const result = await deleteByFilter.mutateAsync({
                filters: buildFilters(),
                dryRun: false,
            });
            toast.success(`Deleted ${result.deleted} documents`);
            setConfirmOpen(false);
            setPreview(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    // Changing the filter invalidates the previewed count and sample
    const resetPreview = () => setPreview(null);

    const matched = preview?.matched ?? null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Filter className="h-4 w-4 text-amber-500" />
                    Delete by filter
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Remove every document matching a condition. Filters use the same syntax as the
                    search API — preview the match count before deleting.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="filter-field">Field</Label>
                        <Select
                            value={field}
                            onValueChange={(v) => {
                                setField(v);
                                resetPreview();
                            }}
                        >
                            <SelectTrigger id="filter-field">
                                <SelectValue placeholder="Select a field" />
                            </SelectTrigger>
                            <SelectContent>
                                {filterableFields.map(f => (
                                    <SelectItem key={f.fieldName} value={f.fieldName}>
                                        {f.fieldName}
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            {f.fieldType}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="filter-operator">Condition</Label>
                        <Select
                            value={operator}
                            onValueChange={(v) => {
                                setOperator(v);
                                resetPreview();
                            }}
                        >
                            <SelectTrigger id="filter-operator">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {FILTER_OPERATORS.map(op => (
                                    <SelectItem key={op.value} value={op.value}>
                                        {op.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="filter-value">Value</Label>
                        <Input
                            id="filter-value"
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                resetPreview();
                            }}
                            disabled={!needsValue}
                            placeholder={needsValue ? 'e.g. discontinued' : 'Not needed'}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handlePreview}
                        disabled={isIncomplete || deleteByFilter.isPending}
                    >
                        {deleteByFilter.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Eye className="mr-2 h-4 w-4" />
                        )}
                        Preview matches
                    </Button>

                    <Button
                        variant="destructive"
                        onClick={() => setConfirmOpen(true)}
                        // Require a preview first: a filter typo here deletes real data
                        disabled={matched === null || matched === 0 || deleteByFilter.isPending}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete matches
                    </Button>

                    {matched !== null && (
                        <Badge variant={matched > 0 ? 'default' : 'secondary'}>
                            {matched.toLocaleString()} match{matched === 1 ? '' : 'es'}
                        </Badge>
                    )}
                </div>

                {preview && preview.sample.length > 0 && (
                    <div className="space-y-2">
                        <DocumentTable
                            documents={preview.sample}
                            columns={preview.columns}
                        />
                        <p className="text-xs text-muted-foreground">
                            {preview.matched > preview.sample.length ? (
                                <>
                                    Showing the first{' '}
                                    <span className="font-medium text-foreground">
                                        {preview.sample.length}
                                    </span>{' '}
                                    of{' '}
                                    <span className="font-medium text-foreground">
                                        {preview.matched.toLocaleString()}
                                    </span>{' '}
                                    matches. Deleting removes <strong>all</strong> of them, not just
                                    the rows above.
                                </>
                            ) : (
                                <>
                                    All{' '}
                                    <span className="font-medium text-foreground">
                                        {preview.matched.toLocaleString()}
                                    </span>{' '}
                                    matching document{preview.matched === 1 ? '' : 's'} shown.
                                </>
                            )}
                        </p>
                    </div>
                )}

                {matched === null && (
                    <p className="text-xs text-muted-foreground">
                        Preview the filter before deleting — the delete button unlocks once you know
                        how many documents it affects.
                    </p>
                )}

                <ConfirmationDialog
                    open={confirmOpen}
                    onOpenChange={setConfirmOpen}
                    title={`Delete ${matched?.toLocaleString() ?? 0} documents?`}
                    description={`Every document where ${field} ${selectedOperator?.label ?? operator}${needsValue ? ` "${value}"` : ''} will be removed from the search index. This cannot be undone.`}
                    actionLabel={`Delete ${matched?.toLocaleString() ?? 0} documents`}
                    variant="destructive"
                    loading={deleteByFilter.isPending}
                    onConfirm={handleDelete}
                />
            </CardContent>
        </Card>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DocumentManagerPanel({ searchIndexId }: DocumentManagerPanelProps) {
    return (
        <div className="space-y-6">
            <BrowseDocuments searchIndexId={searchIndexId} />
            <DocumentLookup searchIndexId={searchIndexId} />
            <DeleteByFilter searchIndexId={searchIndexId} />
        </div>
    );
}
