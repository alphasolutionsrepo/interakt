// app/search-indexes/_components/IngestionKeysCard.tsx

/**
 * Ingestion Keys Card
 *
 * Manages the server-to-server credentials that let an external system push
 * documents into this index.
 *
 * These are NOT search access tokens. An access token is public by design — it
 * ships in the embed snippet and is readable from any page running the widget —
 * so it can only ever read. An ingestion key is a secret that can write and
 * delete, which is why it is shown once and never again.
 *
 * Every Button here sets type="button" explicitly, and must keep doing so. The
 * card renders inside the edit page's <form>, and the shared Button spreads its
 * props onto a bare <button> without defaulting `type` — so an unmarked button
 * is type="submit" and submits that form. The cost is not cosmetic: submitting
 * navigates away, and on the create button that means the key is written to the
 * database and the reveal panel never renders. Only its hash is stored, so the
 * key is then unrecoverable.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
    KeyRound,
    Plus,
    Copy,
    Check,
    Trash2,
    AlertTriangle,
    Loader2,
    ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
    useIngestionKeys,
    useCreateIngestionKey,
    useRevokeIngestionKey,
} from '../_lib/hooks';
import type { IngestionKeySummary, IngestionOperation } from '../_lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface IngestionKeysCardProps {
    searchIndexId: string;
}

const OPERATION_LABELS: Record<IngestionOperation, string> = {
    write: 'Write (add & update documents)',
    delete: 'Delete documents',
};

// ============================================================================
// ONE-TIME REVEAL
// ============================================================================

/**
 * Shows a freshly created key.
 *
 * Deliberately not dismissible by accident and explicit that this is the only
 * viewing — the plaintext is not stored, so a lost key has to be replaced.
 */
function KeyReveal({
    plaintextKey,
    onDismiss,
}: {
    plaintextKey: string;
    onDismiss: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(plaintextKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy to clipboard — select and copy manually');
        }
    };

    return (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                    <p className="font-medium">Copy this key now</p>
                    <p className="mt-0.5 text-amber-700">
                        It is not stored and will not be shown again. If you lose it, revoke this
                        key and create another.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded border border-amber-300 bg-background px-3 py-2 font-mono text-xs">
                    {plaintextKey}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                        <Check className="mr-2 h-3.5 w-3.5" />
                    ) : (
                        <Copy className="mr-2 h-3.5 w-3.5" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                </Button>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-xs text-amber-700">
                    Send it as{' '}
                    <code className="rounded bg-amber-100 px-1 py-0.5">
                        Authorization: Bearer &lt;key&gt;
                    </code>
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
                    I&apos;ve saved it
                </Button>
            </div>
        </div>
    );
}

// ============================================================================
// CREATE FORM
// ============================================================================

function CreateKeyForm({
    searchIndexId,
    onCreated,
    onCancel,
}: {
    searchIndexId: string;
    onCreated: (plaintextKey: string) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState('');
    const [operations, setOperations] = useState<IngestionOperation[]>(['write']);

    const createKey = useCreateIngestionKey(searchIndexId);

    const toggleOperation = (operation: IngestionOperation, checked: boolean) => {
        setOperations(current =>
            checked
                ? [...new Set([...current, operation])]
                : current.filter(entry => entry !== operation)
        );
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Give the key a name so you can recognise it later');
            return;
        }
        if (operations.length === 0) {
            toast.error('Select at least one operation');
            return;
        }

        try {
            const created = await createKey.mutateAsync({
                name: name.trim(),
                operations,
            });
            onCreated(created.plaintextKey);
            setName('');
            setOperations(['write']);
        } catch {
            // useCreateIngestionKey surfaces the error as a toast
        }
    };

    return (
        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="space-y-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input
                    id="key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Storyblok sink (EN)"
                />
                <p className="text-xs text-muted-foreground">
                    Only for your reference — shown in the list below.
                </p>
            </div>

            <div className="space-y-2">
                <Label>Permissions</Label>
                {(Object.keys(OPERATION_LABELS) as IngestionOperation[]).map(operation => (
                    <div key={operation} className="flex items-center gap-2">
                        <Checkbox
                            id={`operation-${operation}`}
                            checked={operations.includes(operation)}
                            onCheckedChange={(checked) =>
                                toggleOperation(operation, checked === true)
                            }
                        />
                        <Label
                            htmlFor={`operation-${operation}`}
                            className="text-sm font-normal"
                        >
                            {OPERATION_LABELS[operation]}
                        </Label>
                    </div>
                ))}
                <p className="text-xs text-muted-foreground">
                    Grant only what the integration needs. Reading documents is always allowed.
                </p>
            </div>

            <div className="flex items-center gap-2">
                <Button type="button" onClick={handleSubmit} disabled={createKey.isPending}>
                    {createKey.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Plus className="mr-2 h-4 w-4" />
                    )}
                    Create key
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={createKey.isPending}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function IngestionKeysCard({ searchIndexId }: IngestionKeysCardProps) {
    const [showForm, setShowForm] = useState(false);
    const [revealedKey, setRevealedKey] = useState<string | null>(null);
    const [keyToRevoke, setKeyToRevoke] = useState<IngestionKeySummary | null>(null);

    const { data: keys, isLoading } = useIngestionKeys(searchIndexId);
    const revokeKey = useRevokeIngestionKey(searchIndexId);

    const handleRevoke = async () => {
        if (!keyToRevoke) return;

        try {
            await revokeKey.mutateAsync(keyToRevoke.id);
            setKeyToRevoke(null);
        } catch {
            // useRevokeIngestionKey surfaces the error as a toast
        }
    };

    return (
        <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                    <KeyRound className="h-4 w-4 text-violet-500" />
                    Ingestion Keys
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Credentials for pushing documents into this index from another system.
                </p>
            </CardHeader>

            <CardContent className="space-y-4">
                <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        These are secrets for server-to-server use. Never put one in a browser, a
                        widget, or client-side code — unlike a search experience access token, an
                        ingestion key can modify and delete your data.
                    </AlertDescription>
                </Alert>

                {revealedKey && (
                    <KeyReveal
                        plaintextKey={revealedKey}
                        onDismiss={() => setRevealedKey(null)}
                    />
                )}

                {showForm && (
                    <CreateKeyForm
                        searchIndexId={searchIndexId}
                        onCreated={(plaintextKey) => {
                            setRevealedKey(plaintextKey);
                            setShowForm(false);
                        }}
                        onCancel={() => setShowForm(false)}
                    />
                )}

                {isLoading && (
                    <div className="space-y-2">
                        {[1, 2].map(i => (
                            <Skeleton key={i} className="h-10 w-full rounded-md" />
                        ))}
                    </div>
                )}

                {!isLoading && keys && keys.length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Permissions</TableHead>
                                    <TableHead>Last used</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {keys.map(key => (
                                    <TableRow
                                        key={key.id}
                                        className={cn(!key.isActive && 'opacity-50')}
                                    >
                                        <TableCell className="font-medium">
                                            {key.name}
                                            {!key.isActive && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-2 text-[10px] text-muted-foreground"
                                                >
                                                    {key.revokedAt ? 'Revoked' : 'Expired'}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {key.keyPrefix}…
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {key.operations.map(operation => (
                                                    <Badge
                                                        key={operation}
                                                        variant="outline"
                                                        className="text-[10px] capitalize"
                                                    >
                                                        {operation}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {key.lastUsedAt
                                                ? format(new Date(key.lastUsedAt), 'd MMM yyyy HH:mm')
                                                : 'Never'}
                                        </TableCell>
                                        <TableCell>
                                            {key.isActive && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                                    onClick={() => setKeyToRevoke(key)}
                                                    aria-label={`Revoke ${key.name}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {!isLoading && (!keys || keys.length === 0) && !showForm && (
                    <div className="py-8 text-center">
                        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-muted/50">
                            <KeyRound className="size-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground">No ingestion keys yet</p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                            Create one to let an external system push documents here
                        </p>
                    </div>
                )}

                {!showForm && (
                    <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create ingestion key
                    </Button>
                )}

                <ConfirmationDialog
                    open={keyToRevoke !== null}
                    onOpenChange={(open) => {
                        if (!open) setKeyToRevoke(null);
                    }}
                    title="Revoke this ingestion key?"
                    description={`"${keyToRevoke?.name}" will stop working immediately. Any system using it will start receiving 401 responses until it is given a new key.`}
                    actionLabel="Revoke"
                    variant="destructive"
                    loading={revokeKey.isPending}
                    onConfirm={handleRevoke}
                />
            </CardContent>
        </Card>
    );
}
