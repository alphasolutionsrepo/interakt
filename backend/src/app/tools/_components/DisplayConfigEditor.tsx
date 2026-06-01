'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { DisplayFieldConfig, ToolDisplayConfig } from '../_lib/api-client';

// ============================================================================
// Constants
// ============================================================================

const ROLES: { value: DisplayFieldConfig['role']; label: string; hint: string }[] = [
  { value: 'title', label: 'Title', hint: 'Main heading' },
  { value: 'subtitle', label: 'Subtitle', hint: 'Secondary text' },
  { value: 'image', label: 'Image', hint: 'Image URL' },
  { value: 'price', label: 'Price', hint: 'Cost value' },
  { value: 'description', label: 'Description', hint: 'Long text' },
  { value: 'rating', label: 'Rating', hint: 'Star rating' },
  { value: 'badge', label: 'Badge', hint: 'Short label' },
  { value: 'link', label: 'Link', hint: 'Detail URL' },
  { value: 'secondary', label: 'Secondary', hint: 'Extra info' },
];

const FORMATS: { value: NonNullable<DisplayFieldConfig['format']>; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'currency', label: 'Currency' },
  { value: 'stars', label: 'Stars' },
  { value: 'date', label: 'Date' },
  { value: 'badge', label: 'Badge' },
  { value: 'image_url', label: 'Image URL' },
  { value: 'link_url', label: 'Link URL' },
];

const VISUAL_PRESETS: { value: string; label: string; hint: string }[] = [
  { value: 'single_card', label: 'Single Card', hint: '1 result' },
  { value: 'item_grid', label: 'Item Grid', hint: '2+ results' },
  { value: 'item_list', label: 'Item List', hint: 'Compact rows' },
  { value: 'comparison_table', label: 'Comparison', hint: 'Side-by-side' },
];

// ============================================================================
// Schema field extraction
// ============================================================================

interface SchemaField {
  name: string;
  type: string;
  nested?: SchemaField[];
}

function extractFieldsFromSchema(
  schema: Record<string, unknown> | null | undefined,
): SchemaField[] {
  if (!schema) return [];

  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields: SchemaField[] = [];

  for (const [name, def] of Object.entries(props)) {
    const type = (def?.type as string) ?? 'unknown';

    // If array of objects, dig into items.properties for nested fields
    if (type === 'array' && def?.items && typeof def.items === 'object') {
      const items = def.items as Record<string, unknown>;
      if (items.properties) {
        const nested = extractFieldsFromSchema(items as Record<string, unknown>);
        fields.push({ name, type: 'array', nested });
        continue;
      }
    }

    // If object, dig into properties
    if (type === 'object' && def?.properties) {
      const nested = extractFieldsFromSchema(def as Record<string, unknown>);
      fields.push({ name, type: 'object', nested });
      continue;
    }

    fields.push({ name, type });
  }

  return fields;
}

/** Flatten nested fields into dot-notation paths with type info */
function flattenFields(
  fields: SchemaField[],
  prefix = '',
): Array<{ path: string; type: string }> {
  const result: Array<{ path: string; type: string }> = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    if (f.nested && f.nested.length > 0) {
      // Include the parent for array/object selection
      result.push({ path, type: f.type });
      // Also include nested children
      result.push(...flattenFields(f.nested, path));
    } else {
      result.push({ path, type: f.type });
    }
  }
  return result;
}

// ============================================================================
// Source Field Picker (schema-aware)
// ============================================================================

interface SchemaFieldEntry {
  path: string;
  type: string;
  displayName?: string;
  role?: string;
}

function SourceFieldPicker({
  value,
  onChange,
  schemaFields,
}: {
  value: string;
  onChange: (v: string) => void;
  schemaFields: SchemaFieldEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter) return schemaFields;
    const lc = filter.toLowerCase();
    return schemaFields.filter((f) =>
      f.path.toLowerCase().includes(lc) ||
      f.displayName?.toLowerCase().includes(lc) ||
      f.role?.toLowerCase().includes(lc)
    );
  }, [schemaFields, filter]);

  // If no schema fields, fall back to free text
  if (schemaFields.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. name"
        className="h-8 text-sm rounded-lg"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full h-8 px-3 text-sm rounded-lg border border-input bg-background hover:bg-accent/50 transition-colors text-left"
        >
          {value ? (
            <span className="font-mono text-xs truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">Select field...</span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter fields..."
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">No matching fields</p>
          )}
          {filtered.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => {
                onChange(f.path);
                setOpen(false);
                setFilter('');
              }}
              className={`
                flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-md transition-colors
                ${value === f.path ? 'bg-accent' : 'hover:bg-accent/50'}
              `}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono truncate">{f.path}</span>
                {f.displayName && f.displayName !== f.path && (
                  <span className="text-[10px] text-muted-foreground truncate">{f.displayName}</span>
                )}
              </div>
              <span className="flex items-center gap-1 shrink-0 ml-2">
                {f.role && (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded bg-indigo-500/10">
                    {f.role}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                  {f.type}
                </span>
                {value === f.path && <Check className="size-3 text-emerald-500" />}
              </span>
            </button>
          ))}
        </div>
        {/* Allow custom entry */}
        <div className="border-t border-border p-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Or type custom path..."
            className="h-7 text-xs font-mono"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Field Row
// ============================================================================

function FieldRow({
  field,
  index,
  schemaFields,
  usedRoles,
  onUpdate,
  onRemove,
}: {
  field: DisplayFieldConfig;
  index: number;
  schemaFields: SchemaFieldEntry[];
  usedRoles: Set<string>;
  onUpdate: (index: number, patch: Partial<DisplayFieldConfig>) => void;
  onRemove: (index: number) => void;
}) {
  const roleInfo = ROLES.find((r) => r.value === field.role);

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:border-border transition-colors">
      {/* Source → Role mapping */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* Source */}
        <div className="flex-1 min-w-0">
          <SourceFieldPicker
            value={field.source}
            onChange={(v) => onUpdate(index, { source: v })}
            schemaFields={schemaFields}
          />
        </div>

        {/* Arrow */}
        <span className="text-muted-foreground text-xs shrink-0">&rarr;</span>

        {/* Role */}
        <div className="w-32 shrink-0">
          <Select
            value={field.role}
            onValueChange={(v) => onUpdate(index, { role: v as DisplayFieldConfig['role'] })}
          >
            <SelectTrigger className="h-8 text-sm rounded-lg">
              <SelectValue>{roleInfo?.label ?? field.role}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => {
                const taken = usedRoles.has(r.value) && r.value !== field.role;
                return (
                  <SelectItem key={r.value} value={r.value} disabled={taken}>
                    <div className="flex items-center gap-2">
                      <span className={taken ? 'opacity-40' : ''}>{r.label}</span>
                      <span className="text-[10px] text-muted-foreground">{r.hint}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Format */}
        <div className="w-24 shrink-0">
          <Select
            value={field.format ?? 'text'}
            onValueChange={(v) => onUpdate(index, { format: v as DisplayFieldConfig['format'] })}
          >
            <SelectTrigger className="h-8 text-sm rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Currency (conditional) */}
        {field.format === 'currency' && (
          <div className="w-16 shrink-0">
            <Input
              value={field.currency ?? 'USD'}
              onChange={(e) => onUpdate(index, { currency: e.target.value })}
              placeholder="USD"
              className="h-8 text-xs rounded-lg font-mono"
            />
          </div>
        )}

        {/* Priority toggle */}
        <button
          type="button"
          onClick={() => onUpdate(index, { priority: field.priority === 'primary' ? 'secondary' : 'primary' })}
          title={field.priority === 'primary' ? 'Primary (always shown)' : 'Secondary (shown if space)'}
          className={`
            shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors
            ${field.priority === 'primary'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
            }
          `}
        >
          {field.priority === 'primary' ? 'P' : 'S'}
        </button>
      </div>

      {/* Delete */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        className="size-7 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ============================================================================
// Default field for new entries
// ============================================================================

function makeEmptyField(): DisplayFieldConfig {
  return { source: '', role: 'secondary', format: 'text', priority: 'primary' };
}

// ============================================================================
// Main Component
// ============================================================================

interface DataSourceFieldInfo {
  name: string;
  displayName: string;
  type: string;
  role?: string | null;
}

interface DisplayConfigEditorProps {
  value: ToolDisplayConfig | null;
  onChange: (config: ToolDisplayConfig | null) => void;
  outputSchema?: Record<string, unknown> | null;
  dataSourceFields?: DataSourceFieldInfo[];
}

export function DisplayConfigEditor({ value, onChange, outputSchema, dataSourceFields }: DisplayConfigEditorProps) {
  const enabled = !!value;
  const fields = value?.fields ?? [];
  const preferredPresets = value?.preferredPresets ?? [];

  // Extract available fields: prefer outputSchema, fall back to data source fields
  const schemaFields = useMemo(() => {
    const fromSchema = extractFieldsFromSchema(outputSchema);
    const flattened = flattenFields(fromSchema);
    if (flattened.length > 0) return flattened;

    // Fallback: use data source schema fields
    if (dataSourceFields && dataSourceFields.length > 0) {
      return dataSourceFields.map((f) => ({
        path: f.name,
        type: f.type,
        displayName: f.displayName,
        role: f.role ?? undefined,
      }));
    }

    return [];
  }, [outputSchema, dataSourceFields]);

  // Track which roles are used (for disabling duplicates)
  const usedRoles = useMemo(
    () => new Set(fields.map((f) => f.role)),
    [fields],
  );

  function toggleEnabled(on: boolean) {
    if (on) {
      onChange({ fields: [makeEmptyField()], preferredPresets: [] });
    } else {
      onChange(null);
    }
  }

  function updateField(index: number, patch: Partial<DisplayFieldConfig>) {
    const updated = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ fields: updated, preferredPresets });
  }

  function addField() {
    onChange({ fields: [...fields, makeEmptyField()], preferredPresets });
  }

  function removeField(index: number) {
    const updated = fields.filter((_, i) => i !== index);
    if (updated.length === 0) {
      onChange(null);
    } else {
      onChange({ fields: updated, preferredPresets });
    }
  }

  function togglePreset(preset: string) {
    const typed = preset as NonNullable<ToolDisplayConfig['preferredPresets']>[number];
    const current = new Set(preferredPresets);
    if (current.has(typed)) {
      current.delete(typed);
    } else {
      current.add(typed);
    }
    onChange({ fields, preferredPresets: [...current] });
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Display Configuration</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Map result fields to semantic roles for visual preset rendering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleEnabled(!enabled)}
          className={`
            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
            border-2 border-transparent transition-colors
            ${enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}
          `}
        >
          <span
            className={`
              pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform
              ${enabled ? 'translate-x-4' : 'translate-x-0.5'}
            `}
          />
        </button>
      </div>

      {!enabled && (
        <p className="text-sm text-muted-foreground italic">
          No display config — this tool&apos;s results will always use rich text (markdown) rendering.
        </p>
      )}

      {enabled && (
        <>
          {/* Column header */}
          <div className="flex items-center gap-3 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="flex-1">Source</div>
              <span className="invisible">&rarr;</span>
              <div className="w-32 shrink-0">Role</div>
              <div className="w-24 shrink-0">Format</div>
              <div className="w-[26px] shrink-0" />
            </div>
            <div className="size-7 shrink-0" />
          </div>

          {/* Field rows */}
          <div className="space-y-1.5">
            {fields.map((field, i) => (
              <FieldRow
                key={i}
                field={field}
                index={i}
                schemaFields={schemaFields}
                usedRoles={usedRoles}
                onUpdate={updateField}
                onRemove={removeField}
              />
            ))}
          </div>

          {/* Add field */}
          <Button type="button" variant="outline" size="sm" onClick={addField} className="h-7 text-xs gap-1">
            <Plus className="size-3" /> Add Field
          </Button>

          {/* Preferred presets */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preferred Presets
            </Label>
            <div className="flex flex-wrap gap-2">
              {VISUAL_PRESETS.map((p) => {
                const isActive = preferredPresets.includes(p.value as any);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePreset(p.value)}
                    className={`
                      flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors cursor-pointer
                      ${isActive
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-emerald-500/60'
                      }
                    `}
                  >
                    <span className={`size-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    {p.label}
                    <span className="text-[10px] opacity-60">{p.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
