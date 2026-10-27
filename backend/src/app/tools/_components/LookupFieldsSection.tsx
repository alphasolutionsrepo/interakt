'use client';

/**
 * A Find Record tool's name and code fields: which fields name an item (read together, in this
 * order) and which hold a code that identifies it. Find Record matches only on the chosen
 * fields; an empty list leaves that side to Find Record, as before fields could be chosen.
 *
 * The lists live in the tool's executorConfig (nameFields, codeFields) and are checked by the
 * server on save against the data source's current fields.
 */

import { AlertTriangle, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { LookupFieldsStatus } from '../_lib/api-client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  checkLookupFields,
  missingLookupFields,
  type LookupFieldsConfig,
} from '@/features/tools/executors/data-source/lookup-field-rules';
import { MultiSelect } from '@/shared/ui/components/multi-select';


interface Props {
  status: LookupFieldsStatus;
  value: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export function LookupFieldsSection({ status, value, onChange }: Props) {
  const nameFields = listOf(value.nameFields);
  const codeFields = listOf(value.codeFields);
  const idField = typeof value.idField === 'string' && value.idField ? value.idField : undefined;
  const [path, setPath] = useState('');

  const label = (f: LookupFieldsStatus['candidates'][number]) =>
    [f.name, f.type, f.searchable ? 'searchable' : null, f.filterable ? 'filterable' : null].filter(Boolean).join(' · ');
  const nameOptions = status.candidates.map((f) => ({ value: f.name, label: label(f) }));
  // External sources fetch an item by its code with an exact filter, so only filterable fields fit
  const codeOptions = status.candidates
    .filter((f) => !status.rules.codesNeedFilter || f.filterable)
    .map((f) => ({ value: f.name, label: label(f) }));
  // A chosen path (variants.sku) isn't a field of its own: keep it selectable
  const withChosen = (options: typeof nameOptions, chosen: string[]) => [
    ...options,
    ...chosen.filter((name) => !options.some((o) => o.value === name)).map((name) => ({ value: name, label: name })),
  ];
  const pathParents = status.candidates.filter((f) => f.hasPaths).map((f) => f.name);

  const set = (key: 'nameFields' | 'codeFields', list: string[]) => onChange({ ...value, [key]: list });
  const suggestion = status.suggested.nameFields.length + status.suggested.codeFields.length > 0;
  const notSetUp = nameFields.length === 0 && codeFields.length === 0 && !idField;

  return (
    <div className="space-y-5">
      {notSetUp && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Not set up yet. Choose at least one field before adding this tool to an AI experience. Experiences that
          already use it keep working.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Name fields</Label>
        <MultiSelect options={withChosen(nameOptions, nameFields)} selected={nameFields} onChange={(list) => set('nameFields', list)} placeholder="Fields that name an item…" />
        <p className="text-xs text-muted-foreground">
          Read together in this order as the item&apos;s name, for example brand then name. Leave empty to let Find
          Record work the name out.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Code fields</Label>
        <MultiSelect options={withChosen(codeOptions, codeFields)} selected={codeFields} onChange={(list) => set('codeFields', list)} placeholder="Fields that hold a code (SKU, id)…" />
        {pathParents.length > 0 && (
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={`A field inside ${pathParents[0]}, e.g. ${pathParents[0]}.sku`}
              className="h-8 rounded-lg text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 rounded-lg"
              disabled={!pathParents.some((p) => path.startsWith(`${p}.`)) || codeFields.includes(path)}
              onClick={() => { set('codeFields', [...codeFields, path]); setPath(''); }}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          A request equal to one of these values finds its item.
          {status.rules.codesNeedFilter ? ' Only fields the index can filter on are listed.' : ''} Leave empty to let
          Find Record work codes out.
          {idField ? ` This tool also looks items up by its id field "${idField}", after any code fields.` : ''}
        </p>
      </div>

      {suggestion && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-xl"
          onClick={() => onChange({ ...value, nameFields: status.suggested.nameFields, codeFields: status.suggested.codeFields })}
        >
          <Sparkles className="size-3.5" /> Use suggested fields
          <span className="text-muted-foreground">
            ({[...status.suggested.nameFields, ...status.suggested.codeFields].join(', ')})
          </span>
        </Button>
      )}

      <LookupFieldsWarnings status={status} chosen={value as LookupFieldsConfig} />
    </div>
  );
}

/**
 * Chosen fields gone from the index, and fields that won't work or only weakly work. The Edit
 * page passes the fields being chosen, so they are checked as they are picked; the tool page
 * shows the saved ones.
 */
export function LookupFieldsWarnings({ status, chosen }: { status: LookupFieldsStatus; chosen?: LookupFieldsConfig }) {
  const known = status.candidates.length > 0;
  const checked = chosen && known ? checkLookupFields(chosen, status.candidates, status.rules) : status;
  const missing = chosen && known ? missingLookupFields(chosen, status.candidates) : status.missing;
  const lines = [
    ...missing.map((name) => `"${name}" is no longer in the index (removed or renamed?). Choose another field.`),
    ...checked.errors.map((e) => e.message),
    ...checked.warnings.map((w) => w.message),
  ];
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {line}
        </li>
      ))}
    </ul>
  );
}
