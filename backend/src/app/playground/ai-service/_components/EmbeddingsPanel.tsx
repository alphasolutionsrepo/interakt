// app/playground/ai-service/_components/EmbeddingsPanel.tsx

'use client';

/**
 * Embeddings Panel
 * 
 * Clean interface for generating and visualizing embeddings.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  Copy,
  Check,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEmbeddings } from '../_lib/hooks/useAIPlayground';
import { UsageStats } from './UsageStats';

interface EmbeddingsPanelProps {
  providerId: string | null;
  modelId: number | null;
}

export function EmbeddingsPanel({
  providerId,
  modelId,
}: EmbeddingsPanelProps) {
  const [texts, setTexts] = useState<string[]>(['']);
  const { generate, result, isLoading, error, reset } = useEmbeddings();

  const handleAddText = useCallback(() => {
    setTexts(prev => [...prev, '']);
  }, []);

  const handleRemoveText = useCallback((index: number) => {
    setTexts(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleTextChange = useCallback((index: number, value: string) => {
    setTexts(prev => prev.map((t, i) => i === index ? value : t));
  }, []);

  const handleGenerate = useCallback(async () => {
    const validTexts = texts.filter(t => t.trim().length > 0);
    if (validTexts.length === 0 || !providerId || !modelId) return;

    await generate({
      texts: validTexts,
      providerId,
      modelId,
    });
  }, [texts, providerId, modelId, generate]);

  const handleClear = useCallback(() => {
    setTexts(['']);
    reset();
  }, [reset]);

  const validTextCount = texts.filter(t => t.trim().length > 0).length;
  const canGenerate = validTextCount > 0 && providerId && modelId && !isLoading;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Texts to Embed</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Enter one or more texts to generate vector embeddings.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddText}
              disabled={isLoading || texts.length >= 10}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Text
            </Button>
          </div>

          <div className="space-y-3">
            {texts.map((text, index) => (
              <div key={index} className="flex gap-3">
                <div className="relative flex-1">
                  <Badge
                    variant="outline"
                    className="absolute left-3 top-3 text-[10px] font-mono"
                  >
                    {index + 1}
                  </Badge>
                  <Textarea
                    placeholder={`Enter text ${index + 1}...`}
                    value={text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    className="min-h-[100px] resize-none pl-12"
                    disabled={isLoading}
                  />
                </div>
                {texts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveText(index)}
                    disabled={isLoading}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              {validTextCount} of {texts.length} texts ready
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isLoading || (texts.length === 1 && !texts[0] && !result)}
              >
                Clear
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="gap-2 min-w-[160px]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Embeddings
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="p-4 border-destructive/50 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-destructive">
                <p className="font-medium">Generation failed</p>
                <p className="text-sm mt-1 opacity-80">{error.message}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Success State */}
        {result && (
          <Card className="p-4 border-emerald-500/50 bg-emerald-500/5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  Embeddings generated successfully
                </p>
                <p className="text-sm mt-1 text-emerald-600/80 dark:text-emerald-400/80">
                  Created {result.embeddings.length} vector{result.embeddings.length !== 1 ? 's' : ''} with {result.metadata.dimensions} dimensions each
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Results</Label>
              <Badge variant="secondary">
                {result.embeddings.length} vectors × {result.metadata.dimensions}d
              </Badge>
            </div>

            <div className="space-y-3">
              {result.embeddings.map((embedding, index) => (
                <EmbeddingCard
                  key={index}
                  index={embedding.index}
                  text={texts[embedding.index] || `Text ${embedding.index + 1}`}
                  vector={embedding.vector}
                  dimensions={embedding.dimensions}
                />
              ))}
            </div>

            <UsageStats
              usage={result.usage}
              metadata={result.metadata}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Embedding Card Component
// ============================================================================

interface EmbeddingCardProps {
  index: number;
  text: string;
  vector: number[];
  dimensions: number;
}

function EmbeddingCard({ index, text, vector, dimensions }: EmbeddingCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(vector));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const min = Math.min(...vector);
  const max = Math.max(...vector);
  const magnitude = Math.sqrt(vector.reduce((a, b) => a + b * b, 0));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="font-mono text-[10px]">
                #{index + 1}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {dimensions}d vector
              </span>
            </div>
            <p className="text-sm truncate">{text}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className={cn(
                  'h-4 w-4 transition-transform',
                  isOpen && 'rotate-180'
                )} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-4 border-t">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Min</p>
                <p className="text-sm font-mono">{min.toFixed(4)}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Max</p>
                <p className="text-sm font-mono">{max.toFixed(4)}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Magnitude</p>
                <p className="text-sm font-mono">{magnitude.toFixed(4)}</p>
              </div>
            </div>

            {/* Visualization */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Vector preview (first 50 dimensions)
              </p>
              <div className="h-12 flex items-end gap-px rounded overflow-hidden bg-muted/30 p-1">
                {vector.slice(0, 50).map((val, i) => {
                  const normalized = (val - min) / (max - min || 1);
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-primary/60 rounded-t-sm transition-all"
                      style={{ height: `${Math.max(8, normalized * 100)}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}