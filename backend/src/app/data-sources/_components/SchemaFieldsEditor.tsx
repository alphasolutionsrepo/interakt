'use client';

/**
 * The discovered field schema, with what profiling measured and room for the operator to say
 * what each field means.
 *
 * Two gaps this closes.
 *
 * Profiling records a null rate and example values per field at discovery, and nothing
 * displayed them — so the operator could not see that a date field is empty on most
 * documents, or that a category field's real values are "Men > Jeans" rather than "jeans".
 * Those facts already reach the planner; they should reach the person configuring it too.
 *
 * `description` has existed on the field schema since it was introduced and nothing ever
 * wrote it. It is rendered into the planning prompt, so it is the one place an operator can
 * correct a misleading field: "type is a file format, not a subject category" is a sentence
 * that fixes tool selection, and it cannot be derived from a sample.
 *
 * Descriptions are edited together and saved in one request, because the whole schema is
 * replaced on write. Saving per field would mean one request per keystroke-group over a
 * payload containing every other field anyway.
 */

import { Loader2, Save } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Mirrors DataSourceField in db/schema/data-sources.schema.ts. */
interface SchemaField {
  name: string;
  displayName?: string;
  type: string;
  role?: string | null;
  isSearchable?: boolean;
  isFilterable?: boolean;
  isSortable?: boolean;
  isRetrievable?: boolean;
  description?: string;
  profile?: {
    sampleSize: number;
    nullRate: number;
    distinctInSample: number;
    sampleValues?: string[];
  };
}

interface Props {
  schema: Record<string, unknown> | null;
  onSave: (fields: SchemaField[]) => Promise<void>;
  isSaving: boolean;
}

/** How full a field is, in words an operator can act on. */
function coverage(field: SchemaField): { label: string; muted: boolean } {
  const profile = field.profile;
  if (!profile) return { label: 'Not profiled', muted: true };

  const filled = Math.round((1 - profile.nullRate) * 100);
  if (filled === 0) return { label: 'Always empty', muted: true };
  if (filled < 50) return { label: `${filled}% filled`, muted: true };
  return { label: `${filled}% filled`, muted: false };
}

export function SchemaFieldsEditor({ schema, onSave, isSaving }: Props) {
  const fields = ((schema?.fields as SchemaField[]) ?? []);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!schema) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No field schema yet. It is discovered on the first successful health check.
      </p>
    );
  }
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No fields defined.</p>;
  }

  const profiled = fields.filter((f) => f.profile).length;
  const dirty = Object.entries(drafts).filter(
    ([name, value]) => (fields.find((f) => f.name === name)?.description ?? '') !== value,
  );

  async function handleSave() {
    if (dirty.length === 0) return;
    const edits = new Map(dirty);
    // Send every field back: the schema is replaced wholesale on write, so omitting a field
    // would delete it along with the provider types and profiles filtering depends on.
    await onSave(
      fields.map((f) => {
        if (!edits.has(f.name)) return f;
        const next = edits.get(f.name)!.trim();
        const { description: _drop, ...rest } = f;
        return next ? { ...rest, description: next } : rest;
      }),
    );
    setDrafts({});
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {profiled > 0
            ? `${fields.length} fields, ${profiled} profiled from a document sample. Add a description where a field's name is misleading — it is included in the planning prompt.`
            : `${fields.length} fields. Run a health check to measure how full each one is and what values it holds.`}
        </p>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={dirty.length === 0 || isSaving}
          className="gap-1.5 shrink-0"
        >
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {dirty.length > 0 ? `Save ${dirty.length}` : 'Save'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {['Field', 'Type', 'Use', 'Coverage', 'Values seen', 'Description'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-xs font-semibold tracking-widest text-muted-foreground uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {fields.map((f) => {
              const cov = coverage(f);
              const values = f.profile?.sampleValues ?? [];
              return (
                <tr key={f.name} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium font-mono text-xs">{f.name}</p>
                    {f.role && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 rounded text-[10px] mt-1">
                        {f.role}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="rounded text-[10px] font-mono">{f.type}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {[
                      f.isSearchable ? 'search' : null,
                      f.isFilterable ? 'filter' : null,
                      f.isSortable ? 'sort' : null,
                    ].filter(Boolean).join(' · ') || 'return only'}
                  </td>
                  <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${cov.muted ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`}>
                    {cov.label}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[260px]">
                    {values.length > 0 ? (
                      <span className="line-clamp-2" title={values.join(', ')}>
                        {values.slice(0, 4).join(', ')}
                        {values.length > 4 ? ` +${values.length - 4}` : ''}
                      </span>
                    ) : f.profile ? (
                      // Profiling withholds examples from free text and high-cardinality
                      // fields; saying which is more useful than an empty cell.
                      <span className="text-muted-foreground/60">
                        {f.profile.distinctInSample > 0 ? 'free text / too varied' : '—'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <Input
                      value={drafts[f.name] ?? f.description ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [f.name]: e.target.value })}
                      placeholder="What this field actually holds"
                      className="h-8 text-xs rounded-lg"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
