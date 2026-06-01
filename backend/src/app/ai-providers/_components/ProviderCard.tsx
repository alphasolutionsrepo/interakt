// app/ai-providers/_components/ProviderCard.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    MoreHorizontal,
    Plug,
    RefreshCw,
    Settings,
    Trash2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Loader2,
    ExternalLink,
    Database,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { AIProviderWithModelsResponse } from '@/features/ai-providers';
import { cn } from '@/lib/utils';

interface ProviderCardProps {
    provider: AIProviderWithModelsResponse;
    onToggleEnabled: (id: string, enabled: boolean) => Promise<void>;
    onTestConnection: (id: string) => Promise<void>;
    onDiscoverModels?: (id: string) => Promise<void>;
    onEdit: (provider: AIProviderWithModelsResponse) => void;
    onManageModels: (provider: AIProviderWithModelsResponse) => void;
    onDelete: (id: string) => Promise<void>;
    isToggling?: boolean;
    isTesting?: boolean;
    isDiscovering?: boolean;
}

export function ProviderCard({
    provider,
    onToggleEnabled,
    onTestConnection,
    onDiscoverModels,
    onEdit,
    onManageModels,
    onDelete,
    isToggling,
    isTesting,
    isDiscovering,
}: ProviderCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);

    const isLocal = provider.providerType === 'local';
    const isOllama = provider.providerKey === 'ollama';

    const availableModels = provider.models?.filter(m => m.isAvailable).length ?? 0;
    const totalModels = provider.models?.length ?? 0;

    const getConnectionStatus = () => {
        if (!provider.lastConnectionStatus) {
            return { icon: AlertCircle, color: 'text-slate-400', text: 'Not tested' };
        }
        if (provider.lastConnectionStatus === 'connected') {
            return { icon: CheckCircle2, color: 'text-emerald-500', text: 'Connected' };
        }
        return { icon: XCircle, color: 'text-red-500', text: 'Failed' };
    };

    const status = getConnectionStatus();
    const StatusIcon = status.icon;

    const handleToggle = async (checked: boolean) => {
        await onToggleEnabled(provider.id, checked);
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(provider.id);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className={cn(
            "group relative bg-white border-2 border-slate-200 rounded-xl p-5 transition-all duration-200",
            "hover:border-slate-300 hover:shadow-sm",
            !provider.isEnabled && "bg-slate-50/80 border-slate-200/70"
        )}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    {/* Provider Icon */}
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold",
                        isLocal
                            ? "bg-violet-50 text-violet-600"
                            : "bg-sky-50 text-sky-600"
                    )}>
                        {provider.displayName.charAt(0).toUpperCase()}
                    </div>

                    <div>
                        <h3 className="font-semibold text-slate-900">
                            {provider.displayName}
                        </h3>
                        <p className="text-sm text-slate-500">
                            {provider.providerKey}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Switch
                        checked={provider.isEnabled}
                        onCheckedChange={handleToggle}
                        disabled={isToggling}
                        className="data-[state=checked]:bg-emerald-500"
                    />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => onEdit(provider)}>
                                <Settings className="h-4 w-4 mr-2" />
                                Configure
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onManageModels(provider)}>
                                <Database className="h-4 w-4 mr-2" />
                                Manage Models
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onTestConnection(provider.id)}
                                disabled={isTesting}
                            >
                                {isTesting ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Plug className="h-4 w-4 mr-2" />
                                )}
                                Test Connection
                            </DropdownMenuItem>
                            {isOllama && onDiscoverModels && (
                                <DropdownMenuItem
                                    onClick={() => onDiscoverModels(provider.id)}
                                    disabled={isDiscovering}
                                >
                                    {isDiscovering ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    Sync Models
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                                {isDeleting ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Meta Info Row */}
            <div className="flex items-center gap-2 mb-4">
                <Badge
                    variant="secondary"
                    className={cn(
                        "text-xs font-medium",
                        isLocal
                            ? "bg-violet-50 text-violet-700 hover:bg-violet-50"
                            : "bg-sky-50 text-sky-700 hover:bg-sky-50"
                    )}
                >
                    {isLocal ? 'Local' : 'Cloud'}
                </Badge>

                {provider.authType === 'api_key' && (
                    <Badge
                        variant="secondary"
                        className={cn(
                            "text-xs font-medium",
                            provider.hasApiKey
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-50"
                        )}
                    >
                        {provider.hasApiKey ? 'API Key Set' : 'No API Key'}
                    </Badge>
                )}
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-between py-3 border-t-2 border-slate-100">
                <div className="flex items-center gap-6">
                    {/* Models */}
                    <div className="text-sm">
                        <span className="text-slate-500">Models</span>
                        <span className="ml-2 font-medium text-slate-900">
                            {availableModels}
                            <span className="text-slate-400">/{totalModels}</span>
                        </span>
                    </div>

                    {/* Connection Status */}
                    <div className="flex items-center gap-1.5 text-sm">
                        <StatusIcon className={cn("h-3.5 w-3.5", status.color)} />
                        <span className="text-slate-500">
                            {provider.lastConnectionCheck
                                ? formatDistanceToNow(new Date(provider.lastConnectionCheck), { addSuffix: true })
                                : status.text}
                        </span>
                    </div>
                </div>

                {/* URL */}
                <div className="flex items-center gap-1 text-xs text-slate-400 max-w-[200px] truncate">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{provider.baseUrl}</span>
                </div>
            </div>
        </div>
    );
}