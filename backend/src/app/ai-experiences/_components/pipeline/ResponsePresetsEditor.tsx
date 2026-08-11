'use client';

/** Which response UI presets an experience may use, and which is the default. */




const ALL_PRESETS: { value: string; label: string; description: string }[] = [
  { value: 'rich_text', label: 'Rich Text', description: 'Markdown-formatted text response' },
  { value: 'single_card', label: 'Single Card', description: 'Detailed view of one result item' },
  { value: 'item_grid', label: 'Item Grid', description: 'Visual grid of multiple items with images' },
  { value: 'item_list', label: 'Item List', description: 'Compact list of results without images' },
  { value: 'comparison_table', label: 'Comparison Table', description: 'Side-by-side comparison of items' },
  { value: 'step_list', label: 'Step List', description: 'Numbered step-by-step instructions' },
  { value: 'summary_with_sources', label: 'Summary + Sources', description: 'Narrative summary with source footnotes' },
];

export function ResponsePresetsEditor({
  enabledPresets,
  defaultPreset,
  editable,
  onChange,
}: {
  enabledPresets: string[];
  defaultPreset: string;
  editable: boolean;
  /** Controlled: the caller owns the value and decides when it is persisted. */
  onChange?: (next: { enabledPresets: string[]; defaultPreset: string }) => void;
}) {
  // Normalize legacy 'markdown_rich' → 'rich_text' for display
  const enabledSet = new Set(enabledPresets.map(p => p === 'markdown_rich' ? 'rich_text' : p));

  function togglePreset(preset: string) {
    if (!onChange || !editable) return;
    // rich_text cannot be disabled — it's the fallback
    if (preset === 'rich_text') return;

    const sanitized = enabledPresets.map(p => p === 'markdown_rich' ? 'rich_text' : p);
    const updated = new Set(sanitized).has(preset)
      ? sanitized.filter(p => p !== preset)
      : [...sanitized, preset];
    const deduped = [...new Set(updated)];

    // If the default was removed, fall back to the preset that cannot be disabled.
    const sanitizedDefault = defaultPreset === 'markdown_rich' ? 'rich_text' : defaultPreset;
    const newDefault = deduped.includes(sanitizedDefault) ? sanitizedDefault : 'rich_text';

    onChange({ enabledPresets: deduped, defaultPreset: newDefault });
  }

  return (
    <div className="mt-3">
      <div className="border border-border/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Response Presets</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The pipeline selects a preset based on tool results and display configs. Only enabled presets are candidates.
          Rich Text is always available as the fallback.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_PRESETS.map((p) => {
            const isEnabled = enabledSet.has(p.value);
            const isRichText = p.value === 'rich_text';
            return (
              <button
                key={p.value}
                type="button"
                disabled={!editable || isRichText}
                onClick={() => togglePreset(p.value)}
                title={`${p.description}${isRichText ? ' (always enabled)' : ''}`}
                className={`
                  flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors
                  ${isEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-border/50 bg-muted/20 text-muted-foreground'
                  }
                  ${editable && !isRichText ? 'cursor-pointer hover:border-emerald-500/60' : ''}
                  ${isRichText ? 'cursor-default' : ''}
                `}
              >
                <span className={`size-1.5 rounded-full ${isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

