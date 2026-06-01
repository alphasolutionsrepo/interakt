// app/ai-providers/_components/ProviderTable.tsx

'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  MoreVertical,
  Edit,
  Trash2,
  TestTube,
  Search,
  Layers,
  Cloud,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { AIProviderWithModelsResponse } from '@/features/ai-providers';

interface ProviderTableProps {
  providers: AIProviderWithModelsResponse[];
  onEdit: (provider: AIProviderWithModelsResponse) => void;
  onDelete: (provider: AIProviderWithModelsResponse) => void;
  onManageModels: (provider: AIProviderWithModelsResponse) => void;
  onTestConnection: (provider: AIProviderWithModelsResponse) => void;
  onDiscoverModels?: (provider: AIProviderWithModelsResponse) => void;
  onToggleEnabled: (provider: AIProviderWithModelsResponse) => void;
  isEnabling?: boolean;
  isDisabling?: boolean;
  isTesting?: boolean;
}

export function ProviderTable({
  providers,
  onEdit,
  onDelete,
  onManageModels,
  onTestConnection,
  onDiscoverModels,
  onToggleEnabled,
  isEnabling,
  isDisabling,
  isTesting,
}: ProviderTableProps) {
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleTestConnection = async (provider: AIProviderWithModelsResponse) => {
    setTestingId(provider.id);
    await onTestConnection(provider);
    setTestingId(null);
  };

  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Cloud className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No AI providers configured</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Get started by adding your first AI provider. Connect to OpenAI, Anthropic, or your local Ollama instance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/60">
            <TableHead className="font-bold text-foreground">Provider</TableHead>
            <TableHead className="font-bold text-foreground">Type</TableHead>
            <TableHead className="font-bold text-foreground">Status</TableHead>
            <TableHead className="font-bold text-foreground">Models</TableHead>
            <TableHead className="font-bold text-foreground">Last Check</TableHead>
            <TableHead className="font-bold text-foreground">Enabled</TableHead>
            <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => {
            const availableModels = provider.models?.filter(m => m.isAvailable).length || 0;
            const totalModels = provider.models?.length || 0;
            const requiresApiKey = provider.authType === 'api_key';
            const showKeyWarning = requiresApiKey && !provider.hasApiKey;

            return (
              <TableRow key={provider.id} className="group">
                {/* Provider Name & Key */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${
                      provider.providerType === 'cloud' ? 'bg-blue-500/10' : 'bg-green-500/10'
                    }`}>
                      {provider.providerType === 'cloud' ? (
                        <Cloud className={`size-5 ${provider.providerType === 'cloud' ? 'text-blue-600' : 'text-green-600'}`} />
                      ) : (
                        <Cpu className="size-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {provider.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {provider.providerKey}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Type */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`capitalize ${
                      provider.providerType === 'cloud'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-green-200 bg-green-50 text-green-700'
                    }`}
                  >
                    {provider.providerType}
                  </Badge>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {provider.lastConnectionStatus === 'success' && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="size-4" />
                        <span className="text-xs font-medium">Connected</span>
                      </div>
                    )}
                    {provider.lastConnectionStatus === 'error' && (
                      <div className="flex items-center gap-1.5 text-red-600">
                        <XCircle className="size-4" />
                        <span className="text-xs font-medium">Failed</span>
                      </div>
                    )}
                    {!provider.lastConnectionStatus && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="size-4" />
                        <span className="text-xs font-medium">Not tested</span>
                      </div>
                    )}
                    {showKeyWarning && (
                      <div className="flex items-center gap-1.5 text-amber-600">
                        <AlertCircle className="size-4" />
                        <span className="text-xs font-medium">No API key</span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Models */}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Layers className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{availableModels}</span>
                    <span className="text-xs text-muted-foreground">/ {totalModels}</span>
                  </div>
                </TableCell>

                {/* Last Check */}
                <TableCell>
                  {provider.lastConnectionCheck ? (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(provider.lastConnectionCheck), { addSuffix: true })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Never</span>
                  )}
                </TableCell>

                {/* Enabled Toggle */}
                <TableCell>
                  <Switch
                    checked={provider.isEnabled}
                    onCheckedChange={() => onToggleEnabled(provider)}
                    disabled={isEnabling || isDisabling}
                  />
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 data-[state=open]:bg-muted"
                      >
                        <MoreVertical className="size-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onEdit(provider)}>
                        <Edit className="mr-2 size-4" />
                        Edit Provider
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onManageModels(provider)}>
                        <Layers className="mr-2 size-4" />
                        Manage Models
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleTestConnection(provider)}
                        disabled={testingId === provider.id || isTesting}
                      >
                        <TestTube className="mr-2 size-4" />
                        {testingId === provider.id ? 'Testing...' : 'Test Connection'}
                      </DropdownMenuItem>
                      {provider.providerKey === 'ollama' && onDiscoverModels && (
                        <DropdownMenuItem onClick={() => onDiscoverModels(provider)}>
                          <Search className="mr-2 size-4" />
                          Discover Models
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(provider)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
