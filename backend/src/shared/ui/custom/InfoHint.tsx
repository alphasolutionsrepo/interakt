// shared/ui/custom/InfoHint.tsx

/**
 * A small (i) next to a form label that explains the setting on hover or keyboard focus.
 * The icon sits in a button so keyboard and screen-reader users can reach the text too.
 */

'use client';

import { Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InfoHintProps {
    /** The explanation, in plain words */
    content: string;
    /** What the hint is about, read out by screen readers, e.g. "About Language" */
    label?: string;
}

export function InfoHint({ content, label = 'More information' }: InfoHintProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button type="button" aria-label={label} className="inline-flex rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-help">
                        <Info className="size-4" aria-hidden="true" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <p className="text-sm">{content}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
