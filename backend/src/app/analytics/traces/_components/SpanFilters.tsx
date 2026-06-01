'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { SpanFilterOptions } from '../_lib/api-client';

interface SpanFiltersProps {
  filters: SpanFilterOptions;
  onChange: (filters: SpanFilterOptions) => void;
}

export function SpanFilters({ filters, onChange }: SpanFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchValue !== (filters.search ?? '')) {
        onChange({ ...filters, search: searchValue || undefined });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (patch: Partial<SpanFilterOptions>) => onChange({ ...filters, ...patch }),
    [filters, onChange],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[260px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search messages or experience name..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="h-9 pl-8"
        />
      </div>

      <Select
        value={filters.statusCode ?? 'all'}
        onValueChange={(v) => update({ statusCode: v === 'all' ? undefined : v })}
      >
        <SelectTrigger size="sm" className="w-[130px]">
          <SelectValue placeholder="All turns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All turns</SelectItem>
          <SelectItem value="UNSET">Successful</SelectItem>
          <SelectItem value="ERROR">Failed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
