// app/analytics/_components/shell/SectionNav.tsx

'use client';

/**
 * The row of analytics sections. Sections for chat experiences are left out
 * when a search-only experience is selected.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { ANALYTICS_SECTIONS } from '../../_lib/sections';

import { cn } from '@/lib/utils';

export function SectionNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { experienceType } = useAnalyticsContext();

  const sections = ANALYTICS_SECTIONS.filter((s) => !(s.chatOnly && experienceType === 'search'));

  return (
    // Scrolls sideways on narrow screens. The bottom line is painted under the tabs (not a
    // border they overlap), so nothing overflows downwards and no vertical scrollbar appears.
    <nav aria-label="Analytics sections" className={cn('overflow-x-auto overflow-y-hidden', className)}>
      <ul className="flex min-w-full w-max gap-1 bg-[linear-gradient(var(--border),var(--border))] bg-[length:100%_1px] bg-bottom bg-no-repeat">
        {sections.map((s) => {
          const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
