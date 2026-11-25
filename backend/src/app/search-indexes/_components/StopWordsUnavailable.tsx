// app/search-indexes/_components/StopWordsUnavailable.tsx

/**
 * What the create wizard and the edit page show in place of the stop word input on an
 * engine that can't apply custom stop words (Azure AI Search): a label next to the title,
 * and a short note saying why and what still happens.
 */

import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { CUSTOM_STOP_WORDS_UNSUPPORTED_REASON } from '@/features/search/providers/index-languages';

export function StopWordsUnavailableBadge() {
    return (
        <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0 rounded-md font-medium">
            Not available on Azure
        </Badge>
    );
}

export function StopWordsUnavailableNotice() {
    return (
        <div className="flex gap-2 items-start rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{CUSTOM_STOP_WORDS_UNSUPPORTED_REASON}</p>
        </div>
    );
}
