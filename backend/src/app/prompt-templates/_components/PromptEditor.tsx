'use client';

/**
 * Editor for a prompt template's content.
 *
 * Until this existed the prompt templates UI was read-only: no component anywhere called
 * createVersion, so the versioning machinery — immutable versions, parent chains, rollback,
 * per-experience overrides — had no way to author the thing it versioned. The template page
 * even rendered an "Editable Sections" list with a green Editable badge next to sections
 * that could not be edited.
 *
 * Two rules shape it:
 *
 *   Saving creates a version; it never mutates one. The stored content is the versioned
 *   artifact, and the running pipeline resolves a template by id, so editing in place would
 *   change what already-audited turns claim to have used.
 *
 *   A saved version is inert until something points at it. createVersion deliberately writes
 *   isSystemDefault: false, so an editor that stopped at "saved" would leave the operator
 *   believing a change had taken effect when nothing had. Activation is therefore part of
 *   the save, and the wording says which experiences it touches.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { validateTemplateContent } from '../_lib/template-variables';

import type { PromptTemplate } from '../_lib/api-client';

interface Props {
  template: PromptTemplate;
  onCancel: () => void;
  onSave: (input: { content: string; label?: string; makeActive: boolean }) => Promise<void>;
  isSaving: boolean;
}

export function PromptEditor({ template, onCancel, onSave, isSaving }: Props) {
  const [content, setContent] = useState(template.content);
  const [label, setLabel] = useState('');
  const [makeActive, setMakeActive] = useState(true);

  const declared = template.metadata?.variables ?? [];
  const { unknown, unused } = validateTemplateContent(content, declared);

  const unchanged = content.trim() === template.content.trim();
  // An unknown variable renders as empty string, so saving one is never what the operator
  // meant. Unused variables are legitimate — a template may deliberately omit a block.
  const blocked = unknown.length > 0 || unchanged || content.trim() === '';

  async function handleSave() {
    if (blocked) return;
    await onSave({
      content,
      label: label.trim() || undefined,
      makeActive,
    });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Editing — saves as version {template.version + 1}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Version {template.version} is kept and can be restored from the version history.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="font-mono text-xs leading-relaxed min-h-[420px]"
          aria-label="Template content"
        />

        {declared.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Available variables:{' '}
            {declared.map((v) => (
              <code key={v.name} className="mr-1.5 rounded bg-muted px-1 py-0.5">
                {`{{${v.name}}}`}
              </code>
            ))}
          </p>
        )}

        {unknown.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-destructive">
                {unknown.length === 1 ? 'Unknown variable' : 'Unknown variables'}:{' '}
                {unknown.map((n) => `{{${n}}}`).join(', ')}
              </p>
              <p className="text-muted-foreground mt-0.5">
                This step does not provide{' '}
                {unknown.length === 1 ? 'that variable' : 'those variables'}, so it would render
                as nothing and the surrounding instruction would be lost. Fix the name or remove it.
              </p>
            </div>
          </div>
        )}

        {unknown.length === 0 && unused.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-500/5 p-3">
            <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Not used by this template:{' '}
              {unused.map((n) => `{{${n}}}`).join(', ')}. That is fine if you meant to leave
              {unused.length === 1 ? ' it' : ' them'} out.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Label (optional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What changed, in a few words"
            className="rounded-xl"
          />
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={makeActive}
            onCheckedChange={(v) => setMakeActive(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs">
            <span className="font-medium">Use this version from now on</span>
            <span className="block text-muted-foreground mt-0.5">
              {makeActive
                ? 'Applies to every experience on the system default for this step. Experiences with their own override keep it.'
                : 'Saved but not used. Assign it from an experience’s Prompts card, or activate it later from the version history.'}
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={blocked || isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save as version {template.version + 1}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSaving} className="gap-1.5">
            <X className="size-3.5" />
            Cancel
          </Button>
          {unchanged && !isSaving && (
            <span className="text-xs text-muted-foreground">No changes yet.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
