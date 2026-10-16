// shared/ui/custom/ProviderModelSelect.tsx

/**
 * AI provider and chat model picker for experiences. "System Default" leaves both
 * unset, and the line under it says which default that resolves to. Shared by AI
 * and search experiences so both choose a model the same way.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AIProvider {
  id: string;
  key: string;
  name: string;
  models: Array<{ id: number; key: string; name: string; type: string }>;
}

interface ResolvedDefaults {
  chat: { providerId: string | null; providerKey: string | null; modelId: number | null; modelKey: string | null };
}

interface ProviderModelSelectProps {
  providerId: string | null;
  modelId: number | null;
  onChange: (value: { providerId: string | null; modelId: number | null }) => void;
}

const DEFAULT = '__default__';

export function ProviderModelSelect({ providerId, modelId, onChange }: ProviderModelSelectProps) {
  const { data: providersData, isLoading } = useQuery({
    queryKey: ['ai-providers-for-experience'],
    queryFn: async () => {
      const res = await fetch('/api/ai-service/providers');
      const json = await res.json() as { data?: { providers: AIProvider[] }; providers?: AIProvider[] };
      return (json.data || json) as { providers: AIProvider[] };
    },
  });

  const { data: resolvedData } = useQuery({
    queryKey: ['system-defaults-ai-resolved'],
    queryFn: async () => {
      const res = await fetch('/api/system-defaults/ai/resolved');
      const json = await res.json() as { data?: ResolvedDefaults } & ResolvedDefaults;
      return (json.data || json) as ResolvedDefaults;
    },
  });

  const providers = providersData?.providers ?? [];
  const selectedProvider = providers.find((p) => p.id === providerId);
  const chatModels = selectedProvider?.models.filter((m) => m.type === 'chat') ?? [];
  const defaultChat = resolvedData?.chat;

  function handleProviderChange(value: string) {
    if (value === DEFAULT) {
      onChange({ providerId: null, modelId: null });
    } else {
      const provider = providers.find((p) => p.id === value);
      const firstChatModel = provider?.models.find((m) => m.type === 'chat');
      onChange({ providerId: value, modelId: firstChatModel?.id ?? null });
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="h-10 bg-muted rounded-xl animate-pulse" />
        <div className="h-10 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Select value={providerId ?? DEFAULT} onValueChange={handleProviderChange}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="System Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>System Default</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={modelId != null ? String(modelId) : DEFAULT}
          onValueChange={(v) => onChange({ providerId, modelId: v === DEFAULT ? null : Number(v) })}
          disabled={!selectedProvider}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder={!selectedProvider ? 'System Default' : 'Select model'} />
          </SelectTrigger>
          <SelectContent>
            {!selectedProvider && <SelectItem value={DEFAULT}>System Default</SelectItem>}
            {chatModels.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!providerId && defaultChat?.providerKey && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0" />
          System default: <span className="font-mono">{defaultChat.providerKey}</span>
          {defaultChat.modelKey && <> / <span className="font-mono">{defaultChat.modelKey}</span></>}
        </p>
      )}
    </div>
  );
}
