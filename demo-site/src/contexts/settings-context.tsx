'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchSettings {
  apiUrl: string;
  accessToken: string;
  exampleQueries: string[];
}

interface SettingsContextValue {
  settings: SearchSettings;
  updateSettings: (settings: Partial<SearchSettings>) => void;
  isConfigured: boolean;
  testConnection: () => Promise<{ success: boolean; error?: string }>;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_SETTINGS: SearchSettings = {
  apiUrl: 'http://localhost:3000',
  accessToken: '',
  exampleQueries: [],
};

const STORAGE_KEY = 'interakt-search-settings';

// ============================================================================
// CONTEXT
// ============================================================================

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    setIsHydrated(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  }, [settings, isHydrated]);

  const updateSettings = useCallback((newSettings: Partial<SearchSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const testConnection = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!settings.accessToken) {
      return { success: false, error: 'Access token is required' };
    }

    try {
      // Test with a simple search request
      const response = await fetch(`${settings.apiUrl}/api/v1/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': settings.accessToken,
        },
        body: JSON.stringify({
          query: 'test',
          page: 1,
          pageSize: 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: error.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }, [settings.apiUrl, settings.accessToken]);

  const isConfigured = Boolean(settings.accessToken);

  // Don't render until hydrated to avoid SSR mismatch
  if (!isHydrated) {
    return null;
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        isConfigured,
        testConnection,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
