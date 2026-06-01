// app/playground/layout.tsx

/**
 * Playground Layout
 * 
 * Simple layout wrapper for playground pages.
 * Navigation is handled by the main app sidebar.
 */

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Playground',
    template: '%s | Playground',
  },
  description: 'Test and experiment with various services',
};

interface PlaygroundLayoutProps {
  children: React.ReactNode;
}

export default function PlaygroundLayout({ children }: PlaygroundLayoutProps) {
  return <>{children}</>;
}