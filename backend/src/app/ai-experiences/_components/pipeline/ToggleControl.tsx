'use client';

/** A small switch used by pipeline step rows and step diagrams alike. */


export function ToggleControl({
  value,
  onToggle,
  saving,
}: {
  value: boolean;
  onToggle: (v: boolean) => void;
  saving: boolean;
}) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => onToggle(!value)}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors
        ${value ? 'bg-emerald-500' : 'bg-muted-foreground/30'}
        ${saving ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform
          ${value ? 'translate-x-4' : 'translate-x-0.5'}
        `}
      />
    </button>
  );
}


