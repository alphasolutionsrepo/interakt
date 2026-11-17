// src/app/data-sources/_components/CreateToolsPanel.tsx

/**
 * "Create tools automatically" on a data source page. Tools belong to Chat, so with Chat off the
 * button stays in view, locked with the reason, and the note says Chat is off (the server refuses
 * the scaffold route then). The tools.scaffold permission and the built-in rule still apply.
 */

'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { toolsApi, type ScaffoldToolsResponse } from '@/app/tools/_lib/api-client';
import { ActionButton, builtInGateFor } from '@/shared/access/ActionControls';
import { useAreaGate } from '@/shared/access/area-gate';
import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';
import { reportActionError } from '@/shared/activity/report';

export function CreateToolsPanel({ dataSourceId, isBuiltIn, onCreated }: {
  dataSourceId: string;
  isBuiltIn: boolean;
  onCreated: (result: ScaffoldToolsResponse) => void;
}) {
  const access = useAccess();
  const gate = useAreaGate(builtInGateFor(access, 'tools.scaffold', isBuiltIn), 'chat');
  const chatOff = !access.isLoading && !access.areaOn('chat');
  const [isScaffolding, setIsScaffolding] = useState(false);

  const create = async () => {
    setIsScaffolding(true);
    try {
      const result = await toolsApi.scaffoldTools(dataSourceId);
      onCreated(result);
      if (result.created.length > 0) {
        toast.success(`Created ${result.created.length} tool${result.created.length !== 1 ? 's' : ''}`);
      } else {
        toast.info('All tools already exist for this data source.');
      }
    } catch (err) {
      reportActionError('Create tools', err);
    } finally {
      setIsScaffolding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 bg-violet-500/5 rounded-xl border border-violet-500/20">
        <div>
          <p className="font-medium text-sm">Create tools automatically</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generates one tool per supported operation with AI descriptions based on the field schema.
          </p>
        </div>
        <ActionButton
          gate={gate}
          icon={isScaffolding ? Loader2 : Sparkles}
          iconClassName={isScaffolding ? 'size-4 mr-2 animate-spin' : 'size-4 mr-2'}
          className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
          onClick={create}
          disabled={isScaffolding}
        >
          {isScaffolding ? 'Creating...' : 'Create Tools'}
        </ActionButton>
      </div>
      {chatOff && <AreaOffNote area="chat" detail="Tools are part of Chat." />}
    </div>
  );
}
