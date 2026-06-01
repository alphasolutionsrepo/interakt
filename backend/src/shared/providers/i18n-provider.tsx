'use client'

import { I18nextProvider } from 'react-i18next';
import i18n from '@/shared/data/i18n';
import { ReactNode } from 'react';

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}