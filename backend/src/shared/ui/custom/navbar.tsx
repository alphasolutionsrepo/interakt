'use client';

import { UserMenu } from '../../../features/auth/components/user-menu';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

export const Navbar = () => {
  return (
    <div className="flex items-center gap-2">
      <UserMenu />
      <ThemeToggle />
      <LanguageSwitcher />
    </div>
  );
};
