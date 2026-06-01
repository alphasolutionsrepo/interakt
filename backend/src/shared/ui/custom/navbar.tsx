'use client';

import { UserMenu } from '../../../features/auth/components/user-menu';
import { LanguageSwitcher } from './language-switcher';

export const Navbar = () => {
  return (
    <div className="flex items-center gap-2">
      <UserMenu />
      <LanguageSwitcher />
    </div>
  );
};
