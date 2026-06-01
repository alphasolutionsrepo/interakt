import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI Chat | Interakt',
  description: 'Chat with an AI Experience',
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  // SettingsProvider is already in the root layout — no extra wrapping needed.
  return <>{children}</>;
}
