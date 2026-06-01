// app/ai-providers/_components/SystemDefaultsCard.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    MessageSquare,
    FileText,
    Database,
    Save,
    Loader2,
    CheckCircle2,
    Circle,
    AlertCircle,
} from 'lucide-react';
import type {
    SystemDefaultsResponse,
    AIProviderWithModelsResponse,
} from '@/features/ai-providers';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DefaultSetting {
    purpose: 'text' | 'embedding' | 'chat';
    label: string;
    description: string;
    icon: React.ReactNode;
    providerId: string | null;
    modelId: number | null;
}

interface SystemDefaultsCardProps {
    defaults?: SystemDefaultsResponse;
    providers: AIProviderWithModelsResponse[];
    onSave: (purpose: 'text' | 'embedding' | 'chat', providerId: string | null, modelId: number | null) => Promise<void>;
    isLoading?: boolean;
    isSaving?: boolean;
}

// ============================================================================
// Single Default Row Component
// ============================================================================

interface DefaultRowProps {
    setting: DefaultSetting;
    providers: AIProviderWithModelsResponse[];
    hasChanges: boolean;
    isSaving: boolean;
    onProviderChange: (purpose: string, providerId: string) => void;
    onModelChange: (purpose: string, modelId: string) => void;
    onSave: () => void;
}

/**
 * Check if a provider requires an API key but doesn't have one configured
 */
function providerNeedsApiKey(provider: AIProviderWithModelsResponse): boolean {
    // Local providers (like Ollama) don't need API keys
    if (provider.providerType === 'local') return false;

    // If auth type is 'none', no API key needed
    if (provider.authType === 'none') return false;

    // Check if API key is configured
    return !provider.hasApiKey;
}

function DefaultRow({
    setting,
    providers,
    hasChanges,
    isSaving,
    onProviderChange,
    onModelChange,
    onSave,
}: DefaultRowProps) {
    const enabledProviders = providers.filter(p => p.isEnabled);
    const selectedProvider = providers.find(p => p.id === setting.providerId);

    // Check if selected provider is missing API key
    const selectedProviderMissingKey = selectedProvider && providerNeedsApiKey(selectedProvider);

    const getModelsForPurpose = () => {
        if (!setting.providerId) return [];
        const provider = providers.find(p => p.id === setting.providerId);
        if (!provider?.models) return [];

        // For embedding, only show embedding models; for others, show text/chat models
        const modelType = setting.purpose === 'embedding' ? 'embedding' : 'chat';
        return provider.models.filter(m =>
            m.isAvailable && (m.modelType === modelType || m.modelType === 'text')
        );
    };

    const availableModels = getModelsForPurpose();
    const selectedModel = selectedProvider?.models?.find(m => m.id === setting.modelId);

    // Validation state
    const hasProvider = setting.providerId !== null;
    const hasModel = setting.modelId !== null;
    const isComplete = hasProvider === hasModel; // Both set or both null
    const isPartial = hasProvider !== hasModel; // One set, one not
    const isConfigured = hasProvider && hasModel;

    // Can't save if: partial selection OR selected provider missing API key
    const cannotSave = isPartial || selectedProviderMissingKey;

    return (
        <div className="py-4 first:pt-0 last:pb-0">
            {/* Label Row */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "p-1.5 rounded-md",
                        cannotSave && hasChanges ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600"
                    )}>
                        {setting.icon}
                    </div>
                    <div>
                        <div className="text-sm font-medium text-slate-900">{setting.label}</div>
                    </div>
                </div>

                {hasChanges && (
                    <Button
                        size="sm"
                        variant={cannotSave ? "outline" : "default"}
                        onClick={onSave}
                        disabled={isSaving || cannotSave}
                        className={cn(
                            "h-7 text-xs",
                            cannotSave && "border-amber-300 text-amber-600 cursor-not-allowed"
                        )}
                    >
                        {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <>
                                <Save className="h-3 w-3 mr-1" />
                                Save
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Selects - Stacked on this card width */}
            <div className="space-y-2">
                {/* Provider Select */}
                <Select
                    value={setting.providerId ?? 'none'}
                    onValueChange={(value) => onProviderChange(setting.purpose, value)}
                >
                    <SelectTrigger
                        className={cn(
                            "w-full h-9 text-sm",
                            isPartial && !hasProvider && "border-amber-400 ring-1 ring-amber-400",
                            selectedProviderMissingKey && "border-amber-400 ring-1 ring-amber-400"
                        )}
                    >
                        <SelectValue placeholder="Select provider..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">
                            <span className="text-slate-400">None</span>
                        </SelectItem>
                        {enabledProviders.map(provider => {
                            const needsKey = providerNeedsApiKey(provider);
                            return (
                                <SelectItem
                                    key={provider.id}
                                    value={provider.id}
                                    disabled={needsKey}
                                    className={cn(needsKey && "opacity-60")}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{provider.displayName}</span>
                                        {needsKey && (
                                            <span className="text-xs text-amber-600 flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" />
                                                No API Key
                                            </span>
                                        )}
                                    </div>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>

                {/* Model Select */}
                <Select
                    value={setting.modelId?.toString() ?? 'none'}
                    onValueChange={(value) => onModelChange(setting.purpose, value)}
                    disabled={!setting.providerId}
                >
                    <SelectTrigger
                        className={cn(
                            "w-full h-9 text-sm",
                            !setting.providerId && "opacity-50",
                            isPartial && hasProvider && !hasModel && "border-amber-400 ring-1 ring-amber-400"
                        )}
                    >
                        <SelectValue placeholder="Select model..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">
                            <span className="text-slate-400">None</span>
                        </SelectItem>
                        {availableModels.map(model => (
                            <SelectItem key={model.id} value={model.id.toString()}>
                                <span className="truncate">{model.displayName}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Status indicator */}
            <div className="mt-2 flex items-center gap-1.5 text-xs">
                {selectedProviderMissingKey ? (
                    <>
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                        <span className="text-amber-600">
                            {selectedProvider?.displayName} requires an API key
                        </span>
                    </>
                ) : isPartial ? (
                    <>
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                        <span className="text-amber-600">
                            {hasProvider ? 'Select a model to save' : 'Select a provider first'}
                        </span>
                    </>
                ) : isConfigured ? (
                    <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-500 truncate">
                            {selectedProvider?.displayName} / {selectedModel?.displayName}
                        </span>
                    </>
                ) : (
                    <>
                        <Circle className="h-3 w-3 text-slate-300" />
                        <span className="text-slate-400">Not configured</span>
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function SystemDefaultsCard({
    defaults,
    providers,
    onSave,
    isLoading,
    isSaving,
}: SystemDefaultsCardProps) {
    const [settings, setSettings] = useState<DefaultSetting[]>([
        {
            purpose: 'chat',
            label: 'Chat Model',
            description: 'Default model for conversational AI',
            icon: <MessageSquare className="h-4 w-4" />,
            providerId: null,
            modelId: null,
        },
        {
            purpose: 'text',
            label: 'Text Generation',
            description: 'Default model for text completion',
            icon: <FileText className="h-4 w-4" />,
            providerId: null,
            modelId: null,
        },
        {
            purpose: 'embedding',
            label: 'Embeddings',
            description: 'Default model for vector embeddings',
            icon: <Database className="h-4 w-4" />,
            providerId: null,
            modelId: null,
        },
    ]);

    const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

    // Initialize from defaults
    useEffect(() => {
        if (defaults) {
            setSettings(prev => prev.map(setting => {
                switch (setting.purpose) {
                    case 'chat':
                        return {
                            ...setting,
                            providerId: defaults.defaultChatProviderId,
                            modelId: defaults.defaultChatModelId,
                        };
                    case 'text':
                        return {
                            ...setting,
                            providerId: defaults.defaultTextProviderId,
                            modelId: defaults.defaultTextModelId,
                        };
                    case 'embedding':
                        return {
                            ...setting,
                            providerId: defaults.defaultEmbeddingProviderId,
                            modelId: defaults.defaultEmbeddingModelId,
                        };
                    default:
                        return setting;
                }
            }));
            setPendingChanges(new Set());
        }
    }, [defaults]);

    const handleProviderChange = (purpose: string, providerId: string) => {
        const actualProviderId = providerId === 'none' ? null : providerId;

        setSettings(prev => prev.map(s => {
            if (s.purpose === purpose) {
                return { ...s, providerId: actualProviderId, modelId: null };
            }
            return s;
        }));
        setPendingChanges(prev => new Set(prev).add(purpose));
    };

    const handleModelChange = (purpose: string, modelId: string) => {
        const actualModelId = modelId === 'none' ? null : parseInt(modelId);

        setSettings(prev => prev.map(s => {
            if (s.purpose === purpose) {
                return { ...s, modelId: actualModelId };
            }
            return s;
        }));
        setPendingChanges(prev => new Set(prev).add(purpose));
    };

    const handleSave = async (setting: DefaultSetting) => {
        await onSave(setting.purpose, setting.providerId, setting.modelId);
        setPendingChanges(prev => {
            const next = new Set(prev);
            next.delete(setting.purpose);
            return next;
        });
    };

    if (isLoading) {
        return (
            <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="p-5 space-y-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header with accent */}
            <div className="px-5 py-4 border-b-2 border-slate-200 bg-slate-100">
                <h3 className="font-semibold text-slate-900">System Defaults</h3>
                <p className="text-sm text-slate-600 mt-0.5">
                    Default AI models for different tasks
                </p>
            </div>

            {/* Settings List */}
            <div className="p-5 divide-y divide-slate-200">
                {settings.map((setting) => (
                    <DefaultRow
                        key={setting.purpose}
                        setting={setting}
                        providers={providers}
                        hasChanges={pendingChanges.has(setting.purpose)}
                        isSaving={isSaving}
                        onProviderChange={handleProviderChange}
                        onModelChange={handleModelChange}
                        onSave={() => handleSave(setting)}
                    />
                ))}
            </div>
        </div>
    );
}