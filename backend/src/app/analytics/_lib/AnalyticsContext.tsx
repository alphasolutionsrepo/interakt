'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type ExperienceType = 'ai' | 'search';

interface AnalyticsContextValue {
  /** Selected experience ID, undefined = all experiences */
  experienceId: string | undefined;
  /** Display name of selected experience */
  experienceName: string;
  /** Type of selected experience */
  experienceType: ExperienceType | undefined;
  /** Update the selected experience */
  setExperience: (id: string | undefined, name?: string, type?: ExperienceType) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [experienceId, setExperienceId] = useState<string | undefined>(undefined);
  const [experienceName, setExperienceName] = useState('All Experiences');
  const [experienceType, setExperienceType] = useState<ExperienceType | undefined>(undefined);

  const setExperience = useCallback((id: string | undefined, name?: string, type?: ExperienceType) => {
    setExperienceId(id);
    setExperienceName(name || 'All Experiences');
    setExperienceType(id ? type : undefined);
  }, []);

  return (
    <AnalyticsContext.Provider value={{ experienceId, experienceName, experienceType, setExperience }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }
  return context;
}
