// app/search-indexes/_components/CustomStopWordsCard.tsx

/**
 * The Custom Stop Words card on the index edit page.
 *
 * On an engine that can't apply custom stop words (Azure AI Search) adding is disabled
 * with the reason shown, but words already stored stay listed with working remove buttons
 * so an admin can clear them.
 */

'use client';

import { Plus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    CUSTOM_STOP_WORDS_UNSUPPORTED_REASON,
    supportsCustomStopWords,
} from '@/features/search/providers/index-languages';

interface CustomStopWordsCardProps {
    provider: string | null | undefined;
    stopWords: string[];
    /** Whether the list differs from what is saved */
    modified: boolean;
    draft: string;
    onDraftChange: (value: string) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
}

export function CustomStopWordsCard({ provider, stopWords, modified, draft, onDraftChange, onAdd, onRemove }: CustomStopWordsCardProps) {
    const addSupported = supportsCustomStopWords(provider);

    return (
        <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                    <X className="h-4 w-4 text-red-500" />
                    Custom Stop Words
                    {modified && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0 rounded-md">
                            modified
                        </Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    Words to ignore during search (comma-separated)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!addSupported && (
                    <p className="text-sm text-muted-foreground">{CUSTOM_STOP_WORDS_UNSUPPORTED_REASON}</p>
                )}
                <div className="flex gap-2">
                    <Input
                        placeholder="e.g., the, a, an"
                        disabled={!addSupported}
                        value={draft}
                        onChange={(e) => onDraftChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                onAdd();
                            }
                        }}
                        className="rounded-lg"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onAdd}
                        disabled={!addSupported || !draft.trim()}
                        className="rounded-lg"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                {stopWords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {stopWords.map((word, i) => (
                            <Badge key={i} variant="outline" className="pl-3 pr-1.5 py-1.5 rounded-lg">
                                <span className="text-xs font-medium">{word}</span>
                                <button
                                    type="button"
                                    onClick={() => onRemove(i)}
                                    className="ml-2 hover:bg-destructive/20 rounded p-0.5 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                )}
                {stopWords.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                        No custom stop words configured
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
