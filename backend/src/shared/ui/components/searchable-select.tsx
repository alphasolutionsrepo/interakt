"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, ChevronDown, Search, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchableSelectOption {
  id: string | number;
  name: string;
  description?: string | null;
  searchType?: string;
  status?: string;
  documentCount?: number;
  responseTemplateRole?: 'search' | 'chat';
  templateConfig?: any;
  [key: string]: any; // Allow additional properties
}

interface SearchableSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchEndpoint: string;
  disabled?: boolean;
  className?: string;
  renderOption?: (option: SearchableSelectOption) => React.ReactNode;
  renderSelected?: (option: SearchableSelectOption) => React.ReactNode;
  minSearchLength?: number;
  searchParams?: Record<string, string>;
  emptyStateMessage?: string;
  createNewButton?: { label: string; href: string };
  valueField?: 'id' | 'name';  // Which field to use as the value
  disableCache?: boolean;  // Disable caching for edit forms
}

export function SearchableSelect({
  value,
  onValueChange,
  placeholder = "Select an option...",
  searchEndpoint,
  disabled = false,
  className,
  renderOption,
  renderSelected,
  minSearchLength = 1,
  searchParams = {},
  emptyStateMessage = "No options found",
  createNewButton,
  disableCache = false,
  valueField = 'id', // Default to using id for backward compatibility
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionCache, setSelectedOptionCache] = useState<SearchableSelectOption | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper function to get the value from an option based on valueField
  const getOptionValue = (option: SearchableSelectOption) => {
    return valueField === 'name' ? option.name : option.id.toString();
  };

  // Helper function to compare values safely
  const compareValues = (option: SearchableSelectOption, targetValue: string | undefined) => {
    if (!targetValue) return false;
    const optionValue = getOptionValue(option);
    return optionValue === targetValue;
  };

  // Find selected option - handle both string and number comparison
  // First try to find in current options, then fall back to cached selected option
  const selectedOption = options.find(opt => compareValues(opt, value)) || 
                         (selectedOptionCache && compareValues(selectedOptionCache, value) ? selectedOptionCache : null);

  // Fetch options from API
  const fetchOptions = useCallback(async (query: string) => {
    if (query.length < minSearchLength && minSearchLength > 0) {
      setOptions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL(searchEndpoint, window.location.origin);
      if (query.trim()) {
        url.searchParams.set('q', query.trim());
      }
      url.searchParams.set('limit', '20');
      
      // Add additional search parameters
      Object.entries(searchParams).forEach(([key, val]) => {
        url.searchParams.set(key, val);
      });

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch options: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setOptions(result.data);
        
        // Cache the selected option if it's in the results and we don't have it cached
        if (value) {
          const foundSelected = result.data.find((opt: SearchableSelectOption) => 
            compareValues(opt, value)
          );
          if (foundSelected) {
            // Always update the cache if we find the selected option
            // This ensures we have the latest display information
            setSelectedOptionCache(foundSelected);
          }
        }
      } else {
        throw new Error(result.error || 'Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching options:', err);
      setError(err instanceof Error ? err.message : 'Failed to load options');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [searchEndpoint, minSearchLength, searchParams]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchOptions(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fetchOptions]);

  // Load initial options when opened
  useEffect(() => {
    if (isOpen && options.length === 0 && !loading) {
      fetchOptions("");
    }
  }, [isOpen, options.length, loading, fetchOptions]);

  // Handle value changes - clear cache if value is cleared, fetch if we need the option
  useEffect(() => {
    if (!value) {
      // Clear cache when value is cleared
      setSelectedOptionCache(null);
    } else if (value && !loading) {
      if (disableCache) {
        // Always fetch fresh data when cache is disabled
        fetchOptions("");
      } else if (!selectedOption) {
        // Standard behavior - fetch only if no selected option found
        fetchOptions("");
      }
    }
  }, [value, selectedOption, loading, fetchOptions, disableCache]);

  // Initial value resolution - fetch options on mount if we have a value but no selected option
  useEffect(() => {
    if (value && !loading) {
      if (disableCache) {
        // Always fetch fresh data when cache is disabled (e.g., for edit forms)
        fetchOptions("");
      } else if (!selectedOptionCache && options.length === 0) {
        // Standard caching behavior - only fetch if no cached option and no options loaded
        fetchOptions("");
      }
    }
  }, [value, selectedOptionCache, loading, options.length, fetchOptions, disableCache]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle selection
  const handleSelect = (option: SearchableSelectOption) => {
    onValueChange(getOptionValue(option));
    setSelectedOptionCache(option); // Cache the selected option
    setIsOpen(false);
    setSearchQuery("");
  };

  // Default option renderer
  const defaultRenderOption = (option: SearchableSelectOption) => (
    <div className="flex flex-col">
      <span className="font-medium">{option.name}</span>
      {option.description && (
        <span className="text-xs text-gray-500 truncate">{option.description}</span>
      )}
      {option.searchType && (
        <span className="text-xs text-blue-600">{option.searchType}</span>
      )}
    </div>
  );

  const defaultRenderSelected = (option: SearchableSelectOption) => (
    <span className="truncate">{option.name}</span>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        className={cn(
          "w-full justify-between font-normal",
          !selectedOption && "text-muted-foreground"
        )}
        disabled={disabled}
        onClick={() => {
          setIsOpen(!isOpen);
          // Focus search input when opened
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        {selectedOption 
          ? (renderSelected ? renderSelected(selectedOption) : defaultRenderSelected(selectedOption))
          : placeholder
        }
        <ChevronDown className={cn(
          "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform",
          isOpen && "rotate-180"
        )} />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                ref={inputRef}
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8"
              />
              {loading && (
                <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto">
            {error ? (
              <div className="p-3 text-sm text-red-600">
                {error}
              </div>
            ) : options.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                {loading ? "Loading..." : 
                 searchQuery.length < minSearchLength ? `Type at least ${minSearchLength} characters to search` :
                 emptyStateMessage}
                {createNewButton && !loading && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(createNewButton.href, '_blank')}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {createNewButton.label}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              options.map((option) => (
                <div
                  key={option.id}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100",
                    value === option.id && "bg-gray-100"
                  )}
                  onClick={() => handleSelect(option)}
                >
                  <div className="flex-1 min-w-0">
                    {renderOption ? renderOption(option) : defaultRenderOption(option)}
                  </div>
                  {value === option.id && (
                    <Check className="h-4 w-4 text-blue-600 ml-2 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}