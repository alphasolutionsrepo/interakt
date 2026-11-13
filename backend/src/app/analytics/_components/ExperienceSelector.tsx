// app/analytics/_components/ExperienceSelector.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot, Search, Layers } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { EXPERIENCE_TYPE_AREA, experiencesWithAreaOn, selectionChange, loadExperienceOptions, type ExperienceOption } from '../_lib/experience-options';

import { useAccess } from '@/shared/access/useAccess';
import { errorText } from '@/shared/api/api-error';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/select';

// ============================================================================
// DATA FETCHING
// ============================================================================

/** `enabled` false while access loads or Analytics is off: the server refuses the list then */
function useExperiences(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['analytics-experiences'],
    queryFn: loadExperienceOptions,
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
  const { experienceId, experienceName, experienceType, setExperience, keepWhenMissing } = useAnalyticsContext();
  const { areaOn, isLoading: accessLoading } = useAccess();
  const { data, isLoading } = useExperiences(!accessLoading && areaOn('analytics'));
  const allExperiences = useMemo(() => data?.experiences ?? [], [data]);
  // Only types whose area is on: a chat experience is hidden with Chat off (its data is kept)
  // areaOn is a new function every render, so the memo depends on the two answers it gives here
  const aiOn = areaOn(EXPERIENCE_TYPE_AREA.ai);
  const searchOn = areaOn(EXPERIENCE_TYPE_AREA.search);
  const experiences = useMemo(
    () => experiencesWithAreaOn(allExperiences, (area) => (area === EXPERIENCE_TYPE_AREA.ai ? aiOn : area === EXPERIENCE_TYPE_AREA.search ? searchOn : true)),
    [allExperiences, aiOn, searchOn],
  );

  const aiExperiences = experiences.filter((e) => e.type === 'ai');
  const searchExperiences = experiences.filter((e) => e.type === 'search');

  // A selection restored from the URL only carries the ID — fill in name and type,
  // or fall back to All Experiences if it no longer exists.
  useEffect(() => {
    const change = selectionChange({
      selected: { id: experienceId, name: experienceName, type: experienceType },
      experiences: allExperiences,
      areaOn,
      loading: isLoading || accessLoading,
      complete: !!data?.complete,
      keepWhenMissing,
    });
    if (change.kind === 'reset') setExperience(undefined);
    else if (change.kind === 'fill') setExperience(change.id, change.name, change.type);
  }, [isLoading, accessLoading, data, allExperiences, areaOn, experienceId, experienceName, experienceType, keepWhenMissing, setExperience]);

  // Selected experience that is not in the list (deleted, or the list is still incomplete)
  const missingSelection = !!experienceId && !allExperiences.some((e) => e.id === experienceId);

  const renderLabel = (exp: ExperienceOption) => (exp.isActive ? exp.name : `${exp.name} (inactive)`);

  const handleChange = (value: string) => {
    if (value === 'all') {
      setExperience(undefined);
    } else {
      const exp = experiences.find((e) => e.id === value);
      setExperience(value, exp?.name, exp?.type);
    }
  };

  if (isLoading || accessLoading) {
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

        {data?.errors.map((error, i) => (
          <p key={i} className="px-2 py-1.5 text-xs text-destructive">{errorText(error, 'Failed to load experiences')}</p>
        ))}

        {missingSelection && (
          <SelectItem value={experienceId}>
            {data?.complete ? `${experienceName} (deleted)` : experienceName}
          </SelectItem>
        )}

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
