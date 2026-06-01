// app/playground/ai-service/_components/TextGenerationPanel.tsx

'use client';

/**
 * Text Generation Panel
 * 
 * Clean, modern interface for text generation with inline controls.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTextGeneration } from '../_lib/hooks/useAIPlayground';
import { UsageStats } from './UsageStats';

interface TextGenerationPanelProps {
  providerId: string | null;
  modelId: number | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt: string;
  onTemperatureChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
}

export function TextGenerationPanel({
  providerId,
  modelId,
  temperature,
  maxTokens,
  topP,
  systemPrompt,
  onTemperatureChange,
  onMaxTokensChange,
  onSystemPromptChange,
}: TextGenerationPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { generate, result, isLoading, error, reset } = useTextGeneration();

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !providerId || !modelId) return;

    await generate({
      prompt: prompt.trim(),
      providerId,
      modelId,
      temperature,
      maxTokens,
      topP,
      systemPrompt: systemPrompt || undefined,
    });
  }, [prompt, providerId, modelId, temperature, maxTokens, topP, systemPrompt, generate]);

  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result?.text]);

  const handleClear = useCallback(() => {
    setPrompt('');
    reset();
  }, [reset]);

  const canGenerate = prompt.trim().length > 0 && providerId && modelId && !isLoading;

  return (
    <div className="h-full flex">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Prompt</Label>
                <span className="text-xs text-muted-foreground">
                  {prompt.length.toLocaleString()} characters
                </span>
              </div>
              <Textarea
                placeholder="Enter your prompt here... (e.g., 'Write a short poem about the ocean')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[140px] text-base resize-none"
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2 text-muted-foreground"
              >
                <Settings2 className="h-4 w-4" />
                Settings
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  showSettings && "rotate-180"
                )} />
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isLoading || (!prompt && !result)}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="gap-2 min-w-[120px]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Collapsible Settings */}
            <Collapsible open={showSettings} onOpenChange={setShowSettings}>
              <CollapsibleContent>
                <Card className="p-4">
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Temperature */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Temperature</Label>
                        <span className="text-sm font-mono text-muted-foreground">
                          {temperature.toFixed(1)}
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={2}
                        step={0.1}
                        value={[temperature]}
                        onValueChange={([v]) => onTemperatureChange(v)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Lower = focused, Higher = creative
                      </p>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-3">
                      <Label className="text-sm">Max Tokens</Label>
                      <Input
                        type="number"
                        min={1}
                        max={128000}
                        value={maxTokens}
                        onChange={(e) => onMaxTokensChange(parseInt(e.target.value, 10) || 1024)}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum response length
                      </p>
                    </div>

                    {/* System Prompt */}
                    <div className="space-y-3 sm:col-span-2 lg:col-span-1">
                      <Label className="text-sm">System Prompt</Label>
                      <Textarea
                        placeholder="Optional instructions..."
                        value={systemPrompt}
                        onChange={(e) => onSystemPromptChange(e.target.value)}
                        className="min-h-[80px] resize-none text-sm"
                      />
                    </div>
                  </div>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Output */}
            {(result || error || isLoading) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Output</Label>
                  {result?.text && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 h-8"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <Card className={cn(
                  "p-4 min-h-[200px]",
                  error && "border-destructive/50 bg-destructive/5"
                )}>
                  {isLoading && (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Generating response...</span>
                    </div>
                  )}

                  {error && (
                    <div className="text-destructive">
                      <p className="font-medium">Generation failed</p>
                      <p className="text-sm mt-1 opacity-80">{error.message}</p>
                    </div>
                  )}

                  {result?.text && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed m-0 p-0 bg-transparent">
                        {result.text}
                      </pre>
                    </div>
                  )}
                </Card>

                {/* Usage Stats */}
                {result && (
                  <UsageStats
                    usage={result.usage}
                    metadata={result.metadata}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}