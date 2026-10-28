// app/analytics/layout.tsx

import { Metadata } from 'next';
import { AnalyticsProvider } from './_lib/AnalyticsContext';
import { AskPanelProvider } from './_lib/AskPanelContext';
import { AnalyticsShell } from './_components/shell/AnalyticsShell';

export const metadata: Metadata = {
  title: 'Analytics | Interakt',
  description: 'Search and AI analytics dashboard',
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnalyticsProvider>
      <AskPanelProvider>
        <AnalyticsShell>{children}</AnalyticsShell>
      </AskPanelProvider>
    </AnalyticsProvider>
  );
}
