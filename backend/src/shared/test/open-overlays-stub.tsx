// src/shared/test/open-overlays-stub.tsx

/**
 * Menus and dialogs render their content inline, as if open, so a server-side render in a test
 * shows every item they hold (Radix renders nothing for a closed menu or a portal on the server).
 * Only for checking what is offered; behaviour is checked live.
 *
 *   vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);
 *   vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);
 */

import type { ReactNode } from 'react';

const Inline = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const Nothing = () => null;

/** A menu item, as a button carrying its label, so tests can find it (aria-disabled: a locked item stays focusable) */
const Item = ({ children, disabled, 'aria-disabled': ariaDisabled }: { children?: ReactNode; disabled?: boolean; 'aria-disabled'?: boolean }) => (
  <button type="button" role="menuitem" disabled={disabled} aria-disabled={ariaDisabled || undefined}>{children}</button>
);

export const dropdownMenu = {
  DropdownMenu: Inline,
  DropdownMenuPortal: Inline,
  DropdownMenuTrigger: Nothing,
  DropdownMenuContent: Inline,
  DropdownMenuGroup: Inline,
  DropdownMenuLabel: Inline,
  DropdownMenuItem: Item,
  DropdownMenuCheckboxItem: Item,
  DropdownMenuRadioGroup: Inline,
  DropdownMenuRadioItem: Item,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: Inline,
  DropdownMenuSub: Inline,
  DropdownMenuSubTrigger: Inline,
  DropdownMenuSubContent: Inline,
};

/** Renders the dialog's content only when open, like the real one */
const Dialog = ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div role="dialog">{children}</div> : null);

export const dialog = {
  Dialog,
  DialogClose: Inline,
  DialogContent: Inline,
  DialogDescription: Inline,
  DialogFooter: Inline,
  DialogHeader: Inline,
  DialogOverlay: Nothing,
  DialogPortal: Inline,
  DialogTitle: Inline,
  DialogTrigger: Nothing,
};
