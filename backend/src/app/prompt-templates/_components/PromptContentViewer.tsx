'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { PromptSection, PromptVariable } from '../_lib/api-client';

// ============================================================================
// PROMPT CONTENT VIEWER
// ============================================================================

export function PromptContentViewer({
  content,
  sections,
  variables,
}: {
  content: string;
  sections: PromptSection[];
  variables: PromptVariable[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Highlight variables and sections in the content
  const highlightedContent = highlightPromptContent(content, sections, variables);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Prompt Content</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative rounded-lg border bg-muted/30 p-4 overflow-auto max-h-[600px]">
          <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {highlightedContent}
          </pre>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-300" />
            Variables
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-300" />
            Editable Sections
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-gray-500/20 border border-gray-300" />
            Conditionals
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Apply syntax highlighting to prompt template content.
 * Returns React elements with colored spans for variables, sections, and conditionals.
 */
function highlightPromptContent(
  content: string,
  sections: PromptSection[],
  variables: PromptVariable[],
): React.ReactNode[] {
  // Split content into tokens for highlighting
  const parts: React.ReactNode[] = [];
  const remaining = content;
  let key = 0;

  // Regex to match all template constructs
  const pattern = /(\{\{#if\s+\w+\}\}|\{\{\/if\}\}|\{\{\w+\}\}|<!-- section:\w+ -->|<!-- \/section:\w+ -->)/g;
  let match;
  let lastIndex = 0;

  const allMatches: Array<{ index: number; length: number; text: string; type: string }> = [];

  while ((match = pattern.exec(content)) !== null) {
    let type = 'variable';
    if (match[0].startsWith('{{#if') || match[0].startsWith('{{/if')) {
      type = 'conditional';
    } else if (match[0].startsWith('<!--')) {
      type = 'section';
    }
    allMatches.push({ index: match.index, length: match[0].length, text: match[0], type });
  }

  for (const m of allMatches) {
    // Text before this match
    if (m.index > lastIndex) {
      parts.push(<span key={key++}>{content.slice(lastIndex, m.index)}</span>);
    }

    // The matched token
    const colorClass =
      m.type === 'variable'
        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded px-0.5'
        : m.type === 'section'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded px-0.5'
          : 'bg-gray-500/15 text-gray-600 dark:text-gray-400 rounded px-0.5';

    parts.push(
      <span key={key++} className={colorClass}>
        {m.text}
      </span>,
    );

    lastIndex = m.index + m.length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }

  return parts;
}
