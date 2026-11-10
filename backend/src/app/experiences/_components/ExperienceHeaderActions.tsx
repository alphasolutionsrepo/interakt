// app/experiences/_components/ExperienceHeaderActions.tsx

'use client';

import { Edit2, Power, PowerOff, RefreshCw } from 'lucide-react';

import type { UiActionId } from '@/features/access/ui-actions';
import { ActionButton } from '@/shared/access/ActionControls';

const ACTIONS: Record<'ai' | 'search', { token: UiActionId; edit: UiActionId }> = {
  ai: { token: 'ai-experiences.token', edit: 'ai-experiences.edit' },
  search: { token: 'search-experiences.token', edit: 'search-experiences.edit' },
};

/** What an experience's detail hook gives (both kinds share the shape) */
export interface ExperienceControls {
  regenerateToken: () => Promise<unknown>;
  isRegeneratingToken: boolean;
  updateExperience: (changes: { isActive: boolean }) => Promise<unknown>;
  isUpdating: boolean;
}

/**
 * Regenerate Token, Activate / Deactivate and Edit at the top of an experience's page, the
 * same for both kinds; each locked with the reason for a role that can't edit that kind.
 * The buttons do their own work through the page's detail hook.
 */
export function ExperienceHeaderActions({ kind, isActive, controls, onEdit }: {
  kind: 'ai' | 'search';
  isActive: boolean;
  controls: ExperienceControls;
  onEdit: () => void;
}) {
  const { token, edit } = ACTIONS[kind];
  return (
    <>
      <ActionButton
        action={token}
        icon={RefreshCw}
        iconClassName={`size-3.5 mr-1.5 ${controls.isRegeneratingToken ? 'animate-spin' : ''}`}
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={() => void controls.regenerateToken()}
        disabled={controls.isRegeneratingToken}
      >
        Regenerate Token
      </ActionButton>
      <ActionButton
        action={edit}
        icon={isActive ? PowerOff : Power}
        iconClassName="size-4 mr-2"
        variant={isActive ? 'outline' : 'default'}
        className={`rounded-xl ${isActive ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
        onClick={() => void controls.updateExperience({ isActive: !isActive })}
        disabled={controls.isUpdating}
      >
        {isActive ? 'Deactivate' : 'Activate'}
      </ActionButton>
      <ActionButton action={edit} icon={Edit2} iconClassName="size-4 mr-2" variant="outline" className="rounded-xl" onClick={onEdit}>
        Edit
      </ActionButton>
    </>
  );
}
