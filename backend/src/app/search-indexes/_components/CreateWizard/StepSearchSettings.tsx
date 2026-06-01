// app/search-indexes/_components/CreateWizard/StepSearchSettings.tsx

/**
 * Step 2: Search Settings
 * 
 * Collects:
 * - Indexing strategy
 * - Language for text analysis
 * - Advanced: Synonyms, Stop words, ES settings
 */

'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
    ChevronDown,
    X,
    Plus,
    Settings2,
    Languages,
    CheckCircle2,
    Zap,
    RefreshCw,
    Clock,
    BookOpen,
    Ban,
} from 'lucide-react';
import {
    INDEXING_STRATEGY_INFO,
    type IndexingStrategy,
} from '@/features/search-index';
import type { WizardFormData } from '@/features/search-index/search-index.wizard-schemas';
import { getProviderUI } from '../providers';

// ============================================================================
// TYPES
// ============================================================================

interface StepSearchSettingsProps {
    formData: WizardFormData;
    errors: Record<string, string>;
    updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LANGUAGES = [
    { value: 'english', label: 'English' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'french', label: 'French' },
    { value: 'german', label: 'German' },
    { value: 'italian', label: 'Italian' },
    { value: 'portuguese', label: 'Portuguese' },
    { value: 'dutch', label: 'Dutch' },
    { value: 'russian', label: 'Russian' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'korean', label: 'Korean' },
    { value: 'arabic', label: 'Arabic' },
    { value: 'standard', label: 'Standard (language-neutral)' },
];

function getStrategyColor(strategy: IndexingStrategy, isSelected: boolean) {
    if (!isSelected) {
        return {
            bg: 'bg-muted/50',
            border: 'border-border',
            iconBg: 'bg-muted',
            iconText: 'text-muted-foreground',
            text: 'text-foreground',
            desc: 'text-muted-foreground',
        };
    }

    switch (strategy) {
        case 'on_upload':
            return {
                bg: 'bg-emerald-50',
                border: 'border-emerald-300 ring-2 ring-emerald-200',
                iconBg: 'bg-emerald-600',
                iconText: 'text-white',
                text: 'text-emerald-900',
                desc: 'text-emerald-700',
            };
        case 'scheduled':
            return {
                bg: 'bg-sky-50',
                border: 'border-sky-300 ring-2 ring-sky-200',
                iconBg: 'bg-sky-600',
                iconText: 'text-white',
                text: 'text-sky-900',
                desc: 'text-sky-700',
            };
        case 'manual':
            return {
                bg: 'bg-orange-50',
                border: 'border-orange-300 ring-2 ring-orange-200',
                iconBg: 'bg-orange-600',
                iconText: 'text-white',
                text: 'text-orange-900',
                desc: 'text-orange-700',
            };
        default:
            return {
                bg: 'bg-muted',
                border: 'border-primary',
                iconBg: 'bg-primary',
                iconText: 'text-primary-foreground',
                text: 'text-foreground',
                desc: 'text-muted-foreground',
            };
    }
}

function getStrategyIcon(strategy: IndexingStrategy) {
    switch (strategy) {
        case 'on_upload': return Zap;
        case 'scheduled': return RefreshCw;
        case 'manual': return Clock;
        default: return Clock;
    }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepSearchSettings({ formData, errors, updateField }: StepSearchSettingsProps) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [newSynonym, setNewSynonym] = useState('');
    const [newStopWord, setNewStopWord] = useState('');

    const indexingStrategy = formData.indexingStrategy || 'on_upload';
    const language = formData.language || 'english';
    const synonyms = formData.synonyms || [];
    const stopWords = formData.stopWords || [];

    // Get provider UI registration for dynamic settings rendering
    const providerUI = getProviderUI(formData.searchProvider || 'elasticsearch');
    const providerSettings = formData.providerSettings ?? providerUI?.defaultSettings ?? {};

    const advancedCount = [
        synonyms.length > 0,
        stopWords.length > 0,
        // Count provider settings that differ from defaults
        ...(providerUI ? Object.keys(providerUI.defaultSettings).map(key =>
            providerSettings[key] !== undefined && providerSettings[key] !== providerUI.defaultSettings[key]
        ) : []),
    ].filter(Boolean).length;

    const handleAddSynonym = useCallback(() => {
        if (newSynonym.trim()) {
            updateField('synonyms', [...synonyms, newSynonym.trim()]);
            setNewSynonym('');
        }
    }, [newSynonym, synonyms, updateField]);

    const handleRemoveSynonym = useCallback((index: number) => {
        updateField('synonyms', synonyms.filter((_, i) => i !== index));
    }, [synonyms, updateField]);

    const handleAddStopWord = useCallback(() => {
        if (newStopWord.trim()) {
            updateField('stopWords', [...stopWords, newStopWord.trim()]);
            setNewStopWord('');
        }
    }, [newStopWord, stopWords, updateField]);

    const handleRemoveStopWord = useCallback((index: number) => {
        updateField('stopWords', stopWords.filter((_, i) => i !== index));
    }, [stopWords, updateField]);

    return (
        <div className="space-y-8">
            {/* Indexing Strategy */}
            <div className="space-y-3">
                <Label className="text-base font-semibold text-foreground">
                    Indexing Strategy
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(Object.keys(INDEXING_STRATEGY_INFO) as IndexingStrategy[]).map((strategy) => {
                        const info = INDEXING_STRATEGY_INFO[strategy];
                        const isSelected = indexingStrategy === strategy;
                        const colors = getStrategyColor(strategy, isSelected);
                        const Icon = getStrategyIcon(strategy);

                        return (
                            <button
                                key={strategy}
                                type="button"
                                onClick={() => updateField('indexingStrategy', strategy)}
                                className={`
                                    relative p-5 rounded-xl border-2 text-left transition-all duration-200
                                    hover:shadow-md hover:-translate-y-0.5
                                    ${colors.bg} ${colors.border}
                                `}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`p-2.5 rounded-lg ${colors.iconBg} ${colors.iconText} shadow-sm`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-semibold ${colors.text}`}>
                                                {info.label}
                                            </span>
                                            {isSelected && (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                            )}
                                        </div>
                                        <p className={`text-sm mt-1 leading-relaxed ${colors.desc}`}>
                                            {info.description}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                {errors.indexingStrategy && (
                    <p className="text-sm text-destructive font-medium">{errors.indexingStrategy}</p>
                )}
            </div>

            {/* Language */}
            <div className="space-y-2">
                <Label htmlFor="language" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    Analysis Language
                </Label>
                <Select
                    value={language}
                    onValueChange={(value) => updateField('language', value)}
                >
                    <SelectTrigger className="h-11 transition-colors focus-visible:border-primary focus-visible:ring-primary/20">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                                {lang.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.language && (
                    <p className="text-sm text-destructive font-medium">{errors.language}</p>
                )}
            </div>

            <Separator className="my-6" />

            {/* Advanced Settings */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        type="button"
                        className="flex items-center gap-2 text-foreground hover:text-foreground hover:bg-muted/80 p-2 -ml-2 h-auto"
                    >
                        <Settings2 className="h-4 w-4" />
                        <span className="font-semibold">Advanced Settings</span>
                        {advancedCount > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                                {advancedCount}
                            </Badge>
                        )}
                        <ChevronDown className={`h-4 w-4 ml-1 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-6">
                    {/* Synonyms */}
                    <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                            <Label className="text-sm font-semibold text-foreground">Synonyms</Label>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="laptop, notebook  or  usa => united states"
                                value={newSynonym}
                                onChange={(e) => setNewSynonym(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddSynonym();
                                    }
                                }}
                                className="h-10 transition-colors focus-visible:border-primary focus-visible:ring-primary/20"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleAddSynonym}
                                disabled={!newSynonym.trim()}
                                className="h-10 w-10 shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {synonyms.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {synonyms.map((synonym, index) => (
                                    <Badge
                                        key={index}
                                        variant="secondary"
                                        className="flex items-center gap-1 pr-1 py-1"
                                    >
                                        <span>{synonym}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveSynonym(index)}
                                            className="ml-1 hover:bg-muted rounded p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Stop Words */}
                    <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2">
                            <Ban className="h-4 w-4 text-muted-foreground" />
                            <Label className="text-sm font-semibold text-foreground">Stop Words</Label>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Words to exclude from indexing"
                                value={newStopWord}
                                onChange={(e) => setNewStopWord(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddStopWord();
                                    }
                                }}
                                className="h-10 transition-colors focus-visible:border-primary focus-visible:ring-primary/20"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleAddStopWord}
                                disabled={!newStopWord.trim()}
                                className="h-10 w-10 shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {stopWords.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {stopWords.map((word, index) => (
                                    <Badge
                                        key={index}
                                        variant="outline"
                                        className="flex items-center gap-1 pr-1 py-1"
                                    >
                                        <span>{word}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveStopWord(index)}
                                            className="ml-1 hover:bg-muted rounded p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Provider-Specific Settings (rendered dynamically) */}
                    {providerUI && (
                        <providerUI.SettingsForm
                            value={providerSettings}
                            onChange={(val) => updateField('providerSettings', val)}
                            errors={errors}
                        />
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}