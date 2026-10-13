// shared/ui/custom/AccessTokenRow.tsx

/**
 * Compact access-token row for experience detail pages: masked token and a
 * one-click copy. Shared by AI and search experiences so both look the same.
 */

'use client';

import { useState } from 'react';
import { Check, Copy, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccessTokenRowProps {
  token: string;
  /** Optional hint after the masked token, e.g. which header to send it in */
  hint?: React.ReactNode;
}

export function AccessTokenRow({ token, hint }: AccessTokenRowProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-muted/30">
      <Key className="size-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">Access Token</span>
        <span className="text-xs text-muted-foreground ml-2">••••••••{token.slice(-8)}</span>
        {hint && <span className="text-xs text-muted-foreground ml-2">{hint}</span>}
      </div>
      <Button variant="ghost" size="icon" className="size-8 rounded-lg shrink-0" onClick={handleCopy} title="Copy access token">
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
