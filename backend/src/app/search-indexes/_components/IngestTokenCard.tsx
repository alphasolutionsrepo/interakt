// app/search-indexes/_components/IngestTokenCard.tsx

'use client';

/**
 * Ingest Token Card
 *
 * Surfaces the per-index ingestion API key on the index edit page.
 * Supports reveal/hide, copy, and rotate (regenerate, revoking the old key).
 * The key authenticates external uploads at
 * POST /api/v1/search-indexes/:id/documents (X-Api-Key / Authorization: Bearer).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { searchIndexesApi } from '../_lib/api-client';

interface IngestTokenCardProps {
  indexId: string;
}

export function IngestTokenCard({ indexId }: IngestTokenCardProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    searchIndexesApi
      .getIngestToken(indexId)
      .then((res) => {
        if (!cancelled) setToken(res.ingestToken);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load API key');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [indexId]);

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('API key copied to clipboard');
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const res = await searchIndexesApi.regenerateIngestToken(indexId);
      setToken(res.ingestToken);
      setRevealed(true);
      setConfirmOpen(false);
      toast.success('API key regenerated. The previous key no longer works.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate API key');
    } finally {
      setIsRegenerating(false);
    }
  };

  const masked = '•'.repeat(36);
  const uploadUrl = `/api/v1/search-indexes/${indexId}/documents`;

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-500" />
          Ingestion API Key
        </CardTitle>
        <CardDescription>
          Use this key to upload documents from an external application — no login required.
          Send it as <code className="text-xs font-mono">X-Api-Key</code> or{' '}
          <code className="text-xs font-mono">Authorization: Bearer</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key field */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            API Key
          </label>
          {isLoading ? (
            <Skeleton className="h-12 w-full rounded-xl" />
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl font-mono text-sm border border-border/50">
              <code className="flex-1 text-foreground/80 truncate">
                {revealed ? token : masked}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                onClick={() => setRevealed((v) => !v)}
                title={revealed ? 'Hide key' : 'Reveal key'}
              >
                {revealed ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                onClick={handleCopy}
                title="Copy API key"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Treat this like a password. Anyone with it can upload documents to this index.
          </p>
        </div>

        {/* Endpoint */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Upload Endpoint
          </label>
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl font-mono text-sm border border-border/50">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">POST</span>
            <code className="flex-1 text-foreground/80 truncate">{uploadUrl}</code>
          </div>
        </div>

        {/* Regenerate */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Rotate the key if it may have been exposed. This immediately revokes the current key.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg shrink-0"
            onClick={() => setConfirmOpen(true)}
            disabled={isLoading || !!loadError}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
        </div>
      </CardContent>

      {/* Confirm regenerate */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Regenerate API key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The current key will stop working immediately. Any external application using it
              must be updated with the new key before it can upload documents again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isRegenerating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              onClick={(e) => {
                e.preventDefault();
                handleRegenerate();
              }}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                'Regenerate'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
