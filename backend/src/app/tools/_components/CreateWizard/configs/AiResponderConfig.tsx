'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

interface AiResponderConfigProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors?: Record<string, string>;
}

const CONTEXT_SOURCES = [
  { id: 'conversation_history', label: 'Conversation History', description: 'Include previous messages for context.' },
  { id: 'tool_results', label: 'Tool Results', description: 'Include results from other tools in context.' },
] as const;

export function AiResponderConfig({ value, onChange, errors }: AiResponderConfigProps) {
  function set(key: string, val: unknown) {
    onChange({ ...value, [key]: val });
  }

  const contextSources = (value.contextSources as string[]) ?? [];
  const temperature = (value.temperature as number) ?? 0.7;
  const maxTokens = (value.maxTokens as number) ?? 1024;

  function toggleContextSource(id: string) {
    const next = contextSources.includes(id)
      ? contextSources.filter((s) => s !== id)
      : [...contextSources, id];
    set('contextSources', next);
  }

  return (
    <div className="space-y-5">
      {/* Instructions */}
      <div className="space-y-1.5">
        <Label>
          Instructions <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={(value.instructions as string) || ''}
          onChange={(e) => set('instructions', e.target.value)}
          placeholder="You are a helpful assistant that answers questions based on the provided context. Be concise and accurate."
          rows={5}
          className={`rounded-xl resize-none ${errors?.instructions ? 'border-destructive' : ''}`}
        />
        {errors?.instructions ? (
          <p className="text-xs text-destructive">{errors.instructions}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            System prompt / instructions for the AI responder (1–10,000 characters).
          </p>
        )}
      </div>

      {/* Context Sources */}
      <div className="space-y-2">
        <Label>Context Sources</Label>
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          {CONTEXT_SOURCES.map((src) => (
            <div key={src.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{src.label}</p>
                <p className="text-xs text-muted-foreground">{src.description}</p>
              </div>
              <Switch
                checked={contextSources.includes(src.id)}
                onCheckedChange={() => toggleContextSource(src.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Temperature</Label>
          <span className="text-sm font-mono font-medium tabular-nums">{temperature.toFixed(1)}</span>
        </div>
        <Slider
          min={0}
          max={2}
          step={0.1}
          value={[temperature]}
          onValueChange={([v]) => set('temperature', v)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Focused (0)</span>
          <span>Creative (2)</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="space-y-1.5">
        <Label>Max Tokens</Label>
        <Input
          type="number"
          min={1}
          max={16000}
          value={maxTokens}
          onChange={(e) => set('maxTokens', Number(e.target.value) || 1024)}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">Maximum tokens in the AI response (1–16,000).</p>
      </div>
    </div>
  );
}
