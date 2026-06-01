// app/analytics/_components/ExperienceSelector.tsx

'use client';

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
}

// ============================================================================
// DATA FETCHING
// ============================================================================

function useExperiences() {
  return useQuery({
    queryKey: ['analytics-experiences'],
    queryFn: async (): Promise<ExperienceOption[]> => {
      const results: ExperienceOption[] = [];

      // Fetch AI experiences
      // Response: { success: true, data: AIExperience[], pagination: {...} }
      try {
        const aiRes = await fetch('/api/ai-experiences?page=1&pageSize=100');
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
              });
            }
          }
        }
      } catch {
        // Continue even if AI experiences fail
      }

      // Fetch search experiences
      // Response: { success: true, data: SearchExperience[], pagination: {...} }
      try {
        const searchRes = await fetch('/api/search-experiences?pageSize=100&isActive=true');
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
              });
            }
          }
        }
      } catch {
        // Continue even if search experiences fail
      }

      return results;
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
  const { experienceId, setExperience } = useAnalyticsContext();
  const { data: experiences = [], isLoading } = useExperiences();

  const aiExperiences = experiences.filter((e) => e.type === 'ai');
  const searchExperiences = experiences.filter((e) => e.type === 'search');

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
      <SelectTrigger className={compact ? 'w-[160px] h-8 text-xs rounded-lg' : 'w-[200px] rounded-xl'}>
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
                {exp.name}
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
                {exp.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
