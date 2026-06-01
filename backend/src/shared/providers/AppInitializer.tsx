"use client";

import { useEffect, useState } from 'react';

interface AppInitializerProps {
  children: React.ReactNode;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        // Only run seeding in development or if explicitly enabled
        const shouldSeed = process.env.NODE_ENV === 'development' || 
                          process.env.NEXT_PUBLIC_ENABLE_SEEDING === 'true';

        if (shouldSeed) {
          console.log('🚀 Initializing app with data seeding...');
          
          // First seed the admin user
          const adminUserResponse = await fetch('/api/admin/seed-admin-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              force: false, 
              verify: true 
            }),
          });

          if (!adminUserResponse.ok) {
            const errorData = await adminUserResponse.json();
            console.warn('⚠️ Admin user seeding failed:', errorData.error || 'Unknown error');
          } else {
            const adminResult = await adminUserResponse.json();
            console.log('✅ Admin user seeding:', adminResult.message);
          }
          
          // Then seed data templates
          const response = await fetch('/api/admin/seed-data-templates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              force: false, 
              verify: true 
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Template seeding failed');
          }

          const result = await response.json();
          console.log('✅ Template seeding completed:', result.message);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        // Still set as initialized to prevent blocking the app
        setIsInitialized(true);
      }
    }

    initialize();
  }, []);

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing application...</p>
        </div>
      </div>
    );
  }

  // Show error state if initialization failed (but don't block the app)
  if (initError) {
    console.warn('⚠️ Initialization completed with warnings:', initError);
    // Don't show error UI, just log it - let the app continue normally
  }

  return <>{children}</>;
}