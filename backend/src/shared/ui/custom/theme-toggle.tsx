'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const THEMES = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

/** Light, dark, or follow the system. Remembered in this browser. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a neutral icon until then
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const Icon = !mounted ? Sun : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" title={t('common.theme.label')}>
          <Icon className="h-4 w-4" />
          <span className="sr-only">{t('common.theme.label')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {THEMES.map(({ value, icon: ItemIcon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="cursor-pointer">
            <ItemIcon className="mr-2 h-4 w-4" />
            <span className="flex-1">{t(`common.theme.${value}`)}</span>
            {mounted && theme === value && <Check className="ml-2 h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
