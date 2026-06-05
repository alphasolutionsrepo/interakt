// app/search-indexes/_components/CreateWizard/StepBasicInfo.tsx

/**
 * Step 1: Basic Information
 * 
 * Collects:
 * - Display name (user-friendly name)
 * - Index name (Elasticsearch-compatible identifier)
 * - Description (optional)
 * - Search type selection
 * 
 * Features:
 * - Auto-generates index name from display name
 * - Real-time name availability checking
 * - Blocks Next if name is taken
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2, FileText, Brain, Zap, Sparkles } from 'lucide-react';
import { useNameAvailability } from '../../_lib/hooks/useSearchIndexes';
import {
    SEARCH_TYPE_INFO,
    type SearchType,
} from '@/features/search-index';
import type { WizardFormData } from '@/features/search-index/search-index.wizard-schemas';
import { getAllProviderUIs } from '../providers';

// ============================================================================
// TYPES
// ============================================================================

interface StepBasicInfoProps {
    formData: WizardFormData;
    errors: Record<string, string>;
    updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
    setExternalError?: (field: string, error: string | undefined) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateIndexName(displayName: string): string {
    return displayName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 128);
}

function getSearchTypeIcon(type: SearchType) {
    switch (type) {
        case 'lexical': return FileText;
        case 'semantic': return Brain;
        case 'hybrid': return Zap;
        default: return FileText;
    }
}

function getSearchTypeColor(type: SearchType, isSelected: boolean) {
    if (!isSelected) {
        return {
            bg: 'bg-card hover:bg-muted/50',
            border: 'border-border/60',
            iconBg: 'bg-muted',
            iconText: 'text-muted-foreground',
            text: 'text-foreground',
            desc: 'text-muted-foreground',
            badge: 'bg-muted text-muted-foreground',
        };
    }

    switch (type) {
        case 'lexical':
            return {
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/50 ring-2 ring-blue-500/20',
                iconBg: 'bg-blue-500',
                iconText: 'text-white',
                text: 'text-blue-600 dark:text-blue-400',
                desc: 'text-blue-600/80 dark:text-blue-400/80',
                badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
            };
        case 'semantic':
            return {
                bg: 'bg-violet-500/10',
                border: 'border-violet-500/50 ring-2 ring-violet-500/20',
                iconBg: 'bg-violet-500',
                iconText: 'text-white',
                text: 'text-violet-600 dark:text-violet-400',
                desc: 'text-violet-600/80 dark:text-violet-400/80',
                badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25',
            };
        case 'hybrid':
            return {
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/50 ring-2 ring-amber-500/20',
                iconBg: 'bg-amber-500',
                iconText: 'text-white',
                text: 'text-amber-600 dark:text-amber-400',
                desc: 'text-amber-600/80 dark:text-amber-400/80',
                badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
            };
        default:
            return {
                bg: 'bg-muted',
                border: 'border-primary',
                iconBg: 'bg-primary',
                iconText: 'text-primary-foreground',
                text: 'text-foreground',
                desc: 'text-muted-foreground',
                badge: 'bg-muted text-muted-foreground',
            };
    }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepBasicInfo({ formData, errors, updateField, setExternalError }: StepBasicInfoProps) {
    const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
    // Providers actually enabled for THIS deployment (env-driven), with which is default.
    const [enabledProviders, setEnabledProviders] = useState<Array<{ type: string; isDefault: boolean }> | null>(null);

    const { isAvailable, isChecking, isDebouncing } = useNameAvailability(
        formData.name || '',
        undefined,
        {
            debounceMs: 400,
            enabled: !!formData.name && formData.name.length >= 3,
        }
    );

    // Report name availability as external error for validation
    useEffect(() => {
        if (setExternalError) {
            if (isAvailable === false) {
                setExternalError('name', 'This name is already in use');
            } else {
                setExternalError('name', undefined);
            }
        }
    }, [isAvailable, setExternalError]);

    useEffect(() => {
        if (!isNameManuallyEdited && formData.displayName) {
            const generatedName = generateIndexName(formData.displayName);
            if (generatedName !== formData.name) {
                updateField('name', generatedName);
            }
        }
    }, [formData.displayName, formData.name, isNameManuallyEdited, updateField]);

    // Load the providers enabled for this deployment and default the selection to
    // the configured default. Without this the wizard keeps its static
    // 'elasticsearch' default and creates indexes against a provider that isn't
    // enabled (e.g. on an Azure-only deploy, the index never reaches Azure).
    useEffect(() => {
        let cancelled = false;
        fetch('/api/search-indexes/providers')
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((data: { providers?: Array<{ type: string; isDefault?: boolean }> }) => {
                if (cancelled) return;
                const list = (data?.providers ?? []).map((p) => ({ type: p.type, isDefault: !!p.isDefault }));
                setEnabledProviders(list);
                if (list.length > 0 && !list.some((p) => p.type === formData.searchProvider)) {
                    const def = list.find((p) => p.isDefault)?.type ?? list[0].type;
                    updateField('searchProvider', def);
                }
            })
            .catch(() => {
                // Leave the form default; the server applies the configured default as a backstop.
            });
        return () => { cancelled = true; };
        // Run once on mount; intentionally not keyed on formData.searchProvider.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleNameChange = useCallback((value: string) => {
        setIsNameManuallyEdited(true);
        updateField('name', value.toLowerCase());
    }, [updateField]);

    const getNameStatus = () => {
        if (!formData.name || formData.name.length < 3) return null;
        if (isDebouncing || isChecking) {
            return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
        }
        if (isAvailable === true) {
            return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        }
        if (isAvailable === false) {
            return <AlertCircle className="h-4 w-4 text-destructive" />;
        }
        return null;
    };

    // Determine if name field has error (from validation OR availability check)
    const hasNameError = errors.name || isAvailable === false;

    return (
        <div className="space-y-6">
            {/* Search Type Selection */}
            <div className="space-y-3">
                <Label className="text-base font-semibold text-foreground">
                    Search Type <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(Object.keys(SEARCH_TYPE_INFO) as SearchType[]).map((type) => {
                        const info = SEARCH_TYPE_INFO[type];
                        const isSelected = formData.searchType === type;
                        const colors = getSearchTypeColor(type, isSelected);
                        const Icon = getSearchTypeIcon(type);

                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => updateField('searchType', type)}
                                className={`
                                    relative p-5 rounded-2xl border-2 text-left transition-all duration-200
                                    hover:shadow-md hover:-translate-y-0.5
                                    ${colors.bg} ${colors.border}
                                `}
                            >
                                <div className="flex items-start gap-3 h-full">
                                    <div className={`p-2.5 rounded-xl ${colors.iconBg} ${colors.iconText} shadow-sm shrink-0`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-semibold ${colors.text}`}>
                                                {info.label}
                                            </span>
                                            {isSelected && (
                                                <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${colors.text}`} />
                                            )}
                                        </div>
                                        <p className={`text-sm mt-1 leading-relaxed ${colors.desc} flex-1`}>
                                            {info.description}
                                        </p>
                                        {/* Badge area - reserve space for consistent card heights */}
                                        <div className="h-7 mt-2.5">
                                            {info.requiresAI && (
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-xs font-medium rounded-lg border ${colors.badge}`}
                                                >
                                                    <Sparkles className="h-3 w-3 mr-1" />
                                                    Requires AI
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                {errors.searchType && (
                    <p className="text-sm text-destructive font-medium">{errors.searchType}</p>
                )}
            </div>

            {/* Search Provider Selection */}
            {(() => {
                // Show only providers enabled for this deployment (env-driven). Until
                // the fetch resolves, fall back to the full registry.
                const enabledTypes = enabledProviders?.map((p) => p.type) ?? null;
                const providers = enabledTypes
                    ? getAllProviderUIs().filter((p) => enabledTypes.includes(p.type))
                    : getAllProviderUIs();
                // Only show selector if more than one provider is enabled
                if (providers.length <= 1) return null;
                const defaultType = enabledProviders?.find((p) => p.isDefault)?.type ?? providers[0]?.type;
                return (
                    <div className="space-y-2">
                        <Label htmlFor="searchProvider" className="text-sm font-semibold text-foreground">
                            Search Provider
                        </Label>
                        <Select
                            value={formData.searchProvider || defaultType}
                            onValueChange={(value) => updateField('searchProvider', value)}
                        >
                            <SelectTrigger className="h-11 rounded-xl transition-colors focus-visible:border-primary focus-visible:ring-primary/20">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {providers.map((provider) => (
                                    <SelectItem key={provider.type} value={provider.type} className="rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="font-medium">{provider.label}</span>
                                            <span className="text-xs text-muted-foreground">{provider.description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.searchProvider && (
                            <p className="text-sm text-destructive font-medium">{errors.searchProvider}</p>
                        )}
                    </div>
                );
            })()}

            {/* AI Info Alert */}
            {(formData.searchType === 'semantic' || formData.searchType === 'hybrid') && (
                <Alert className="bg-violet-500/10 border-violet-500/30 rounded-xl">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <AlertDescription className="text-violet-600 dark:text-violet-400">
                        You&apos;ll configure an AI provider and embedding model in Step 3.
                    </AlertDescription>
                </Alert>
            )}

            {/* Display Name */}
            <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-semibold text-foreground">
                    Display Name <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="displayName"
                    placeholder="Product Catalog Search"
                    value={formData.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                    className={`h-11 rounded-xl transition-colors ${errors.displayName
                        ? 'border-destructive focus-visible:ring-destructive/30'
                        : 'focus-visible:border-primary focus-visible:ring-primary/20'
                        }`}
                />
                {errors.displayName && (
                    <p className="text-sm text-destructive font-medium">{errors.displayName}</p>
                )}
            </div>

            {/* Index Name */}
            <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                    Index Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                    <Input
                        id="name"
                        placeholder="product-catalog-search"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className={`h-11 pr-10 font-mono text-sm rounded-xl transition-colors ${hasNameError
                            ? 'border-destructive focus-visible:ring-destructive/30'
                            : 'focus-visible:border-primary focus-visible:ring-primary/20'
                            }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {getNameStatus()}
                    </div>
                </div>
                {errors.name && (
                    <p className="text-sm text-destructive font-medium">{errors.name}</p>
                )}
                {!errors.name && isAvailable === false && (
                    <p className="text-sm text-destructive font-medium">This name is already in use</p>
                )}
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-foreground">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                    id="description"
                    placeholder="What is this search index for?"
                    value={formData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    rows={2}
                    className={`rounded-xl transition-colors ${errors.description
                        ? 'border-destructive focus-visible:ring-destructive/30'
                        : 'focus-visible:border-primary focus-visible:ring-primary/20'
                        }`}
                />
                {errors.description && (
                    <p className="text-sm text-destructive font-medium">{errors.description}</p>
                )}
            </div>
        </div>
    );
}