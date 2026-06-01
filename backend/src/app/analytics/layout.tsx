// app/analytics/layout.tsx

import { Metadata } from 'next';
import { AnalyticsProvider } from './_lib/AnalyticsContext';

export const metadata: Metadata = {
  title: 'Analytics | Interakt',
  description: 'Search and AI analytics dashboard',
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AnalyticsProvider>{children}</AnalyticsProvider>;
}
