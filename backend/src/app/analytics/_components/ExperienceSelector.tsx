// app/analytics/_components/ExperienceSelector.tsx

'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/select';
import { Bot, Search, Layers } from 'lucide-react';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';

// ============================================================================
// TYPES
// ============================================================================

interface ExperienceOption {
  id: string;
  name: string;
  slug: string;
  type: 'ai' | 'search';
  isActive: boolean;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

function useExperiences() {
  return useQuery({
    queryKey: ['analytics-experiences'],
    queryFn: async (): Promise<{ experiences: ExperienceOption[]; complete: boolean }> => {
      const results: ExperienceOption[] = [];
      // False when either list failed to load — a missing experience may then just be unloaded
      let complete = true;

      // Fetch AI experiences
      // Response: { success: true, data: AIExperience[], pagination: {...} }
      try {
        const aiRes = await fetch('/api/ai-experiences?page=1&pageSize=100');
        if (!aiRes.ok) complete = false;
        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          // data is the array directly (from successWithPagination)
          const experiences = Array.isArray(aiJson.data) ? aiJson.data : (aiJson.data?.experiences || []);
          for (const exp of experiences) {
            if (exp.id && exp.name) {
              results.push({
                id: exp.id,
                name: exp.name,
                slug: exp.slug || '',
                type: 'ai',
                isActive: exp.isActive !== false,
              });
            }
          }
        }
      } catch {
        complete = false;
        // Continue even if AI experiences fail
      }

      // Fetch search experiences (inactive ones too — they can still have historical data)
      // Response: { success: true, data: SearchExperience[], pagination: {...} }
      try {
        const searchRes = await fetch('/api/search-experiences?pageSize=100');
        if (!searchRes.ok) complete = false;
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const experiences = Array.isArray(searchJson.data) ? searchJson.data : [];
          for (const exp of experiences) {
            if (exp.id && exp.name) {
              results.push({
                id: exp.id,
                name: exp.name,
                slug: exp.slug || '',
                type: 'search',
                isActive: exp.isActive !== false,
              });
            }
          }
        }
      } catch {
        complete = false;
        // Continue even if search experiences fail
      }

      return { experiences: results, complete };
    },
    staleTime: 60000,
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ExperienceSelectorProps {
  compact?: boolean;
}

export function ExperienceSelector({ compact = false }: ExperienceSelectorProps) {
  const { experienceId, experienceName, experienceType, setExperience } = useAnalyticsContext();
  const { data, isLoading } = useExperiences();
  const experiences = data?.experiences ?? [];

  const aiExperiences = experiences.filter((e) => e.type === 'ai');
  const searchExperiences = experiences.filter((e) => e.type === 'search');

  // A selection restored from the URL only carries the ID — fill in name and type,
  // or fall back to All Experiences if it no longer exists.
  useEffect(() => {
    if (isLoading || !experienceId) return;
    const exp = experiences.find((e) => e.id === experienceId);
    if (!exp) {
      // Only drop the selection when we know the full list; a failed fetch is not "deleted"
      if (data?.complete) setExperience(undefined);
    } else if (exp.name !== experienceName || exp.type !== experienceType) {
      setExperience(exp.id, exp.name, exp.type);
    }
  }, [isLoading, data, experiences, experienceId, experienceName, experienceType, setExperience]);

  const renderLabel = (exp: ExperienceOption) => (exp.isActive ? exp.name : `${exp.name} (inactive)`);

  const handleChange = (value: string) => {
    if (value === 'all') {
      setExperience(undefined);
    } else {
      const exp = experiences.find((e) => e.id === value);
      setExperience(value, exp?.name, exp?.type);
    }
  };

  if (isLoading) {
    return (
      <div className={compact ? 'w-[140px] h-8 rounded-lg bg-muted animate-pulse' : 'w-[200px] h-9 rounded-xl bg-muted animate-pulse'} />
    );
  }

  return (
    <Select value={experienceId || 'all'} onValueChange={handleChange}>
      <SelectTrigger
        title={experienceName}
        className={compact ? 'w-auto min-w-[160px] max-w-[280px] h-8 text-xs rounded-lg' : 'w-auto min-w-[200px] max-w-[340px] rounded-xl'}
      >
        <Layers className={compact ? 'mr-1.5 size-3 text-muted-foreground' : 'mr-2 size-4 text-muted-foreground'} />
        <SelectValue placeholder="All Experiences" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          <span className="flex items-center gap-2">
            All Experiences
          </span>
        </SelectItem>

        {aiExperiences.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-xs">
              <Bot className="size-3" />
              AI Experiences
            </SelectLabel>
            {aiExperiences.map((exp) => (
              <SelectItem key={exp.id} value={exp.id}>
                {renderLabel(exp)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {searchExperiences.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-xs">
              <Search className="size-3" />
              Search Experiences
            </SelectLabel>
            {searchExperiences.map((exp) => (
              <SelectItem key={exp.id} value={exp.id}>
                {renderLabel(exp)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
