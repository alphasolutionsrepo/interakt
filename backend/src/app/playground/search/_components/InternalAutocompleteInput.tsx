// app/playground/search/_components/InternalAutocompleteInput.tsx

/**
 * Internal Autocomplete Input Component
 *
 * A search input with autocomplete dropdown for the Search Playground.
 * Uses internal API (no access token required).
 * Uses Portal to render dropdown above all other content.
 */

'use client';

import { useRef, useEffect, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, Loader2, Sparkles } from 'lucide-react';
import {
    useInternalAutocomplete,
    type UseInternalAutocompleteOptions,
    type AutocompleteSuggestion,
} from '../_lib/hooks/useInternalAutocomplete';

// ============================================================================
// TYPES
// ============================================================================

export interface InternalAutocompleteInputProps
    extends Omit<UseInternalAutocompleteOptions, 'onSelect'> {
    /** Input placeholder */
    placeholder?: string;
    /** Class name for the container */
    className?: string;
    /** Class name for the input */
    inputClassName?: string;
    /** Callback when a suggestion is selected */
    onSuggestionSelect?: (suggestion: AutocompleteSuggestion) => void;
    /** Callback when query changes */
    onQueryChange?: (query: string) => void;
    /** Callback when Enter is pressed (for search) */
    onSearch?: (query: string) => void;
    /** Initial query value */
    initialQuery?: string;
    /** Show timing info */
    showTiming?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const InternalAutocompleteInput = forwardRef<HTMLInputElement, InternalAutocompleteInputProps>(
    function InternalAutocompleteInput(
        {
            indexId,
            minLength = 2,
            maxSuggestions = 8,
            debounceMs = 150,
            enabled = true,
            placeholder = 'Search...',
            className,
            inputClassName,
            onSuggestionSelect,
            onQueryChange,
            onSearch,
            initialQuery = '',
            showTiming = false,
        },
        ref
    ) {
        const containerRef = useRef<HTMLDivElement>(null);
        const dropdownRef = useRef<HTMLDivElement>(null);
        const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
        const [isMounted, setIsMounted] = useState(false);

        const {
            suggestions,
            isLoading,
            error,
            query,
            setQuery,
            selectSuggestion,
            showSuggestions,
            hideSuggestions,
            took,
        } = useInternalAutocomplete({
            indexId,
            minLength,
            maxSuggestions,
            debounceMs,
            enabled,
            onSelect: onSuggestionSelect,
        });

        // Set mounted state for portal
        useEffect(() => {
            setIsMounted(true);
        }, []);

        // Set initial query
        useEffect(() => {
            if (initialQuery && initialQuery !== query) {
                setQuery(initialQuery);
            }
        }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

        // Calculate dropdown position when showing suggestions
        useEffect(() => {
            if (showSuggestions && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + window.scrollY + 4,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        }, [showSuggestions, suggestions]);

        // Handle click outside to close dropdown
        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                const target = event.target as Node;
                if (
                    containerRef.current &&
                    !containerRef.current.contains(target) &&
                    dropdownRef.current &&
                    !dropdownRef.current.contains(target)
                ) {
                    hideSuggestions();
                }
            };

            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, [hideSuggestions]);

        // Handle input change
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setQuery(value);
            onQueryChange?.(value);
        };

        // Handle keyboard navigation
        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                hideSuggestions();
                onSearch?.(query);
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        };

        // Handle suggestion click
        const handleSuggestionClick = (suggestion: AutocompleteSuggestion) => {
            selectSuggestion(suggestion);
            onSearch?.(suggestion.text);
        };

        // Dropdown content rendered via portal
        const dropdownContent = showSuggestions && suggestions.length > 0 && isMounted ? (
            createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-background rounded-lg border shadow-2xl overflow-hidden"
                    style={{
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        width: dropdownPosition.width,
                        zIndex: 99999,
                    }}
                >
                    {/* Timing info */}
                    {showTiming && took !== null && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center gap-1.5 bg-muted/30">
                            <Sparkles className="h-3 w-3" />
                            {suggestions.length} suggestions in {took}ms
                        </div>
                    )}

                    {/* Suggestions list */}
                    <ul className="max-h-80 overflow-auto py-1">
                        {suggestions.map((suggestion, index) => (
                            <li key={`${suggestion.text}-${suggestion.field}-${index}`}>
                                <button
                                    type="button"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className={cn(
                                        'w-full px-3 py-2.5 text-left hover:bg-muted transition-colors',
                                        'flex items-center justify-between gap-3 text-sm'
                                    )}
                                >
                                    <span className="flex-1 min-w-0 truncate">
                                        {suggestion.highlight ? (
                                            <span
                                                dangerouslySetInnerHTML={{ __html: suggestion.highlight }}
                                                className="[&>mark]:bg-amber-200 [&>mark]:text-amber-900 [&>mark]:rounded-sm [&>mark]:px-0.5"
                                            />
                                        ) : (
                                            suggestion.text
                                        )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground flex-shrink-0 bg-muted px-1.5 py-0.5 rounded">
                                        {suggestion.field}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>,
                document.body
            )
        ) : null;

        return (
            <div ref={containerRef} className={cn('relative', className)}>
                {/* Input */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        ref={ref}
                        type="text"
                        value={query}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className={cn('pl-10 pr-10', inputClassName)}
                    />
                    {isLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                    )}
                </div>

                {/* Dropdown rendered via portal */}
                {dropdownContent}

                {/* Error display */}
                {error && !showSuggestions && (
                    <div className="absolute z-50 w-full mt-1 bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-md border border-destructive/20">
                        {error}
                    </div>
                )}
            </div>
        );
    }
);

export default InternalAutocompleteInput;
