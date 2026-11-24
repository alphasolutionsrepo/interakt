// app/search-indexes/_components/IndexLanguageSelect.tsx

/**
 * The index language picker, shared by the create wizard and the edit page.
 * Offers the languages the index's search engine can analyse text in.
 */

'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { getIndexLanguageChoices } from '@/features/search/providers/index-languages';

interface IndexLanguageSelectProps {
    /** The index's search provider type, e.g. 'elasticsearch' or 'azure-ai-search' */
    provider: string | null | undefined;
    value: string;
    onChange: (value: string) => void;
    id?: string;
    triggerClassName?: string;
    contentClassName?: string;
    itemClassName?: string;
}

export function IndexLanguageSelect({
    provider,
    value,
    onChange,
    id,
    triggerClassName,
    contentClassName,
    itemClassName,
}: IndexLanguageSelectProps) {
    const { options, currentNote } = getIndexLanguageChoices(provider, value);

    return (
        <>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={id} className={triggerClassName}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className={contentClassName}>
                    {options.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value} className={itemClassName}>
                            {lang.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {currentNote && <p className="text-xs text-amber-600 dark:text-amber-400">{currentNote}</p>}
        </>
    );
}
