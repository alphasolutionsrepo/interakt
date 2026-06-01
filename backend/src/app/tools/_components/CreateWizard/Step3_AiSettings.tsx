'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface Step3Data {
  aiDescription: string;
  inputSchema: string;
  outputSchema: string;
}

interface Step3Props {
  data: Step3Data;
  onChange: (data: Step3Data) => void;
  errors: Record<string, string>;
}

const INPUT_SCHEMA_PLACEHOLDER = JSON.stringify(
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      maxResults: { type: 'number', description: 'Max results to return' },
    },
    required: ['query'],
  },
  null,
  2
);

const OUTPUT_SCHEMA_PLACEHOLDER = JSON.stringify(
  {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: { type: 'object', description: 'A result item' },
      },
      totalCount: { type: 'number' },
    },
  },
  null,
  2
);

export function Step3_AiSettings({ data, onChange, errors }: Step3Props) {
  const [inputOpen, setInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* AI Description */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-description">
          AI Description <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="ai-description"
          value={data.aiDescription}
          onChange={(e) => onChange({ ...data, aiDescription: e.target.value })}
          placeholder="Use this tool when the user asks about products, prices, or availability. It searches the product catalog and returns structured results."
          rows={4}
          className={`rounded-xl resize-none ${errors.aiDescription ? 'border-destructive' : ''}`}
        />
        {errors.aiDescription ? (
          <p className="text-xs text-destructive">{errors.aiDescription}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Describes to the AI when and how to call this tool. Be specific — this directly influences
            tool selection in agentic mode (10–2,000 characters).
          </p>
        )}
      </div>

      {/* Input Schema */}
      <Collapsible open={inputOpen} onOpenChange={setInputOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors">
          <div>
            <p className="text-sm font-semibold">Input Schema</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              JSON Schema describing the parameters this tool accepts.
            </p>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${inputOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Textarea
            value={data.inputSchema}
            onChange={(e) => onChange({ ...data, inputSchema: e.target.value })}
            placeholder={INPUT_SCHEMA_PLACEHOLDER}
            rows={8}
            className="rounded-xl font-mono text-sm resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Optional. Must be valid JSON Schema if provided.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Output Schema */}
      <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors">
          <div>
            <p className="text-sm font-semibold">Output Schema</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              JSON Schema describing the response format from this tool.
            </p>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${outputOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Textarea
            value={data.outputSchema}
            onChange={(e) => onChange({ ...data, outputSchema: e.target.value })}
            placeholder={OUTPUT_SCHEMA_PLACEHOLDER}
            rows={8}
            className="rounded-xl font-mono text-sm resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Optional. Documents the response structure for AI context.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
