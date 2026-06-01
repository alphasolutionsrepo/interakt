// app/search-experiences/_components/CreateWizard/CustomInstructionsGenerator/CustomInstructionsGenerator.tsx

/**
 * Custom Instructions Generator Component
 *
 * A modal dialog that helps users generate custom instructions for their
 * search experience using AI. Users can provide additional context and
 * preview/compare generated instructions before applying.
 */

'use client';

import * as React from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, ArrowRight, Check, RefreshCw, Info } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomInstructionsGeneratorProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Experience name (for context) */
  experienceName: string;
  /** Experience description (for context) */
  experienceDescription?: string;
  /** Selected index IDs */
  indexIds: string[];
  /** Type of instructions: 'chat' or 'summary' */
  type: 'chat' | 'summary';
  /** Current instructions value */
  currentInstructions?: string;
  /** Callback when instructions are applied */
  onApply: (instructions: string) => void;
}

interface GenerateResponse {
  success: boolean;
  data: {
    instructions: string;
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomInstructionsGenerator({
  open,
  onOpenChange,
  experienceName,
  experienceDescription,
  indexIds,
  type,
  currentInstructions,
  onApply,
}: CustomInstructionsGeneratorProps) {
  const [additionalContext, setAdditionalContext] = useState('');
  const [generatedInstructions, setGeneratedInstructions] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setGeneratedInstructions(null);
      setShowComparison(false);
      // Keep additional context if user wants to regenerate
    }
  }, [open]);

  // Generate instructions mutation
  const generateMutation = useMutation({
    mutationFn: async (): Promise<GenerateResponse> => {
      const response = await fetch('/api/search-experiences/generate-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experienceName,
          experienceDescription,
          indexIds,
          additionalContext: additionalContext.trim() || undefined,
          type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate instructions');
      }

      return response.json();
    },
    onSuccess: (response) => {
      setGeneratedInstructions(response.data.instructions);
      if (currentInstructions) {
        setShowComparison(true);
      }
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const handleApply = () => {
    if (generatedInstructions) {
      onApply(generatedInstructions);
      onOpenChange(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedInstructions(null);
    setShowComparison(false);
    generateMutation.mutate();
  };

  const typeLabel = type === 'chat' ? 'Chat' : 'Summary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Generate {typeLabel} Instructions
          </DialogTitle>
          <DialogDescription>
            Use AI to generate custom instructions based on your search index data.
            You can provide additional context to tailor the instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Guidance Alert */}
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-blue-700 text-sm">
              <strong>What this generates:</strong> AI persona, domain expertise, tone, and behavior rules.
              <br />
              <strong>Already handled:</strong> Search functionality, response formatting, and safety.
            </AlertDescription>
          </Alert>

          {/* Additional Context Input */}
          {!generatedInstructions && (
            <div className="space-y-2">
              <Label htmlFor="additionalContext">
                Additional Context (Optional)
              </Label>
              <Textarea
                id="additionalContext"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Describe your business, target audience, specific policies, or any preferences for the AI assistant..."
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Examples: &quot;We sell premium wines to enthusiasts&quot;, &quot;Be formal and professional&quot;,
                &quot;Always mention free shipping over $50&quot;
              </p>
            </div>
          )}

          {/* Loading State */}
          {generateMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
                <p className="text-sm text-muted-foreground">
                  Analyzing your index fields and generating instructions...
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {generateMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {generateMutation.error?.message || 'Failed to generate instructions. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Generated Instructions */}
          {generatedInstructions && !generateMutation.isPending && (
            <div className="space-y-4">
              {/* Comparison View */}
              {showComparison && currentInstructions && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Current Instructions</Label>
                    <div className="p-3 rounded-md bg-muted/30 border text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {currentInstructions || <span className="text-muted-foreground/70 italic">None</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-green-600">
                      <Sparkles className="h-3 w-3" />
                      Generated Instructions
                    </Label>
                    <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {generatedInstructions}
                    </div>
                  </div>
                </div>
              )}

              {/* Single View (no existing instructions) */}
              {!showComparison && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    Generated Instructions
                  </Label>
                  <div className="p-4 rounded-md bg-muted/30 border text-sm max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {generatedInstructions}
                  </div>
                </div>
              )}

              {/* Editable Preview */}
              <div className="space-y-2">
                <Label htmlFor="editInstructions">
                  Edit before applying (optional)
                </Label>
                <Textarea
                  id="editInstructions"
                  value={generatedInstructions}
                  onChange={(e) => setGeneratedInstructions(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!generatedInstructions ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || indexIds.length === 0}
                className="gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Instructions
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={generateMutation.isPending}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </Button>
              <Button
                onClick={handleApply}
                className="gap-2"
              >
                <Check className="h-4 w-4" />
                Apply Instructions
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomInstructionsGenerator;
