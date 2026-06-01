'use client';

import { useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ToolTypeChip } from '@/app/tools/_components/ToolTypeChip';
import { useAllActiveTools } from '@/app/tools/_lib/hooks/useTools';
import type { AIExperienceToolAssignment, AssignToolPayload, UpdateToolAssignmentPayload } from '../_lib/api-client';

// ============================================================================
// TOOL PICKER DIALOG
// ============================================================================

interface ToolPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignedToolIds: string[];
  onAssign: (toolId: string) => Promise<void>;
  isAssigning: boolean;
}

function ToolPickerDialog({ open, onOpenChange, assignedToolIds, onAssign, isAssigning }: ToolPickerDialogProps) {
  const { data: tools = [], isLoading } = useAllActiveTools();
  const [search, setSearch] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const filtered = tools.filter(
    (t) =>
      !assignedToolIds.includes(t.id) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.executorType.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAssign(toolId: string) {
    setAssigningId(toolId);
    try {
      await onAssign(toolId);
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Tool</DialogTitle>
          <DialogDescription>
            Select a tool to add to this AI experience.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search ? 'No tools match your search.' : 'All available tools are already assigned.'}
            </div>
          ) : (
            filtered.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{tool.name}</p>
                    <ToolTypeChip executorType={tool.executorType} operation={tool.operation} size="sm" />
                  </div>
                  {tool.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="rounded-xl shrink-0"
                  onClick={() => handleAssign(tool.id)}
                  disabled={isAssigning || assigningId === tool.id}
                >
                  {assigningId === tool.id ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                  Assign
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TOOL ASSIGNMENT ROW
// ============================================================================

interface ToolAssignmentRowProps {
  assignment: AIExperienceToolAssignment;
  onToggleEnabled: (isEnabled: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
  onUpdateOverride: (data: UpdateToolAssignmentPayload) => Promise<void>;
  isRemoving: boolean;
}

function ToolAssignmentRow({ assignment, onToggleEnabled, onRemove, onUpdateOverride, isRemoving }: ToolAssignmentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [overrideDesc, setOverrideDesc] = useState(assignment.overrideAiDescription ?? '');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  async function handleSaveOverride() {
    setIsSavingOverride(true);
    try {
      await onUpdateOverride({ overrideAiDescription: overrideDesc || null });
    } finally {
      setIsSavingOverride(false);
    }
  }

  return (
    <div className={`rounded-xl border ${assignment.isEnabled ? 'border-border/60' : 'border-border/30 opacity-60'} bg-card transition-all`}>
      <div className="flex items-center gap-3 p-4">
        {/* Drag handle (visual only) */}
        <GripVertical className="size-4 text-muted-foreground/40 shrink-0 cursor-grab" />

        {/* Tool info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{assignment.tool.name}</p>
            <ToolTypeChip executorType={assignment.tool.executorType} operation={assignment.tool.operation} size="sm" />
            <Badge variant="outline" className="rounded-lg text-[11px] px-1.5 py-0.5 font-mono text-muted-foreground">
              #{assignment.sortOrder}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{assignment.tool.slug}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={assignment.isEnabled}
            onCheckedChange={(v) => onToggleEnabled(v)}
            title={assignment.isEnabled ? 'Disable tool' : 'Enable tool'}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={isRemoving}
          >
            {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded overrides */}
      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-3 bg-muted/20 rounded-b-xl">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Override AI Description</Label>
            <Textarea
              value={overrideDesc}
              onChange={(e) => setOverrideDesc(e.target.value)}
              placeholder={assignment.tool.aiDescription}
              rows={3}
              className="rounded-xl resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the tool&apos;s default AI description.
            </p>
          </div>
          <Button size="sm" className="rounded-xl" onClick={handleSaveOverride} disabled={isSavingOverride}>
            {isSavingOverride ? <Loader2 className="size-3 mr-1 animate-spin" /> : null}
            Save Override
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

interface ToolAssignmentPanelProps {
  experienceId: string;
  assignments: AIExperienceToolAssignment[];
  onAssign: (payload: AssignToolPayload) => Promise<void>;
  onUpdateAssignment: (toolId: string, data: UpdateToolAssignmentPayload) => Promise<void>;
  onRemove: (toolId: string) => Promise<void>;
  isAssigning: boolean;
  isRemovingTool: boolean;
}

export function ToolAssignmentPanel({
  assignments,
  onAssign,
  onUpdateAssignment,
  onRemove,
  isAssigning,
  isRemovingTool,
}: ToolAssignmentPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingToolId, setRemovingToolId] = useState<string | null>(null);

  const assignedToolIds = assignments.map((a) => a.toolId);

  async function handleAssign(toolId: string) {
    await onAssign({ toolId, isEnabled: true, sortOrder: assignments.length });
  }

  async function handleRemove(toolId: string) {
    setRemovingToolId(toolId);
    try {
      await onRemove(toolId);
    } finally {
      setRemovingToolId(null);
    }
  }

  const sorted = [...assignments].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">No tools assigned</p>
          <p className="text-xs text-muted-foreground mt-1">
            Assign tools to enable this experience to call external capabilities.
          </p>
        </div>
      ) : (
        sorted.map((assignment) => (
          <ToolAssignmentRow
            key={assignment.id}
            assignment={assignment}
            onToggleEnabled={(isEnabled) =>
              onUpdateAssignment(assignment.toolId, { isEnabled })
            }
            onRemove={() => handleRemove(assignment.toolId)}
            onUpdateOverride={(data) => onUpdateAssignment(assignment.toolId, data)}
            isRemoving={isRemovingTool && removingToolId === assignment.toolId}
          />
        ))
      )}

      <Button
        variant="outline"
        className="w-full rounded-xl gap-2 border-dashed"
        onClick={() => setPickerOpen(true)}
        disabled={isAssigning}
      >
        <Plus className="size-4" />
        Assign Tool
      </Button>

      <ToolPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        assignedToolIds={assignedToolIds}
        onAssign={handleAssign}
        isAssigning={isAssigning}
      />
    </div>
  );
}
