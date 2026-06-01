// app/ai-providers/_components/ModelFormDialog.tsx

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, MessageSquare, FileText, Database, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIProviderModelResponse } from '@/features/ai-providers';

// ============================================================================
// Model Type Config
// ============================================================================

const MODEL_TYPE_CONFIG = {
    text: { label: 'Text Generation', icon: FileText },
    embedding: { label: 'Embedding', icon: Database },
    chat: { label: 'Chat', icon: MessageSquare },
    vision: { label: 'Vision', icon: Eye },
} as const;

// ============================================================================
// Form Schema
// ============================================================================

const modelFormSchema = z.object({
    modelKey: z.string()
        .min(1, 'Model key is required')
        .max(100, 'Model key too long')
        .regex(/^[a-zA-Z0-9._-]+$/, 'Model key can only contain letters, numbers, dots, hyphens, and underscores'),

    displayName: z.string()
        .min(1, 'Display name is required')
        .max(150, 'Display name too long'),

    description: z.string()
        .max(500, 'Description too long')
        .optional()
        .nullable(),

    modelType: z.enum(['text', 'chat', 'embedding', 'vision']),

    dimensions: z.number()
        .int()
        .positive()
        .max(10000, 'Dimensions value too large')
        .optional()
        .nullable(),

    isAvailable: z.boolean().default(true),

    // Pricing fields for cost estimation
    inputCostPerMillionTokens: z.number()
        .min(0, 'Cost cannot be negative')
        .max(1000, 'Cost seems too high')
        .optional()
        .nullable(),

    outputCostPerMillionTokens: z.number()
        .min(0, 'Cost cannot be negative')
        .max(1000, 'Cost seems too high')
        .optional()
        .nullable(),

    // Capabilities (flattened for form, will be restructured on submit)
    usesCompletionTokens: z.boolean().default(false),
    noTemperature: z.boolean().default(false),
}).refine(
    (data) => {
        // Dimensions required for embedding models
        if (data.modelType === 'embedding' && !data.dimensions) {
            return false;
        }
        return true;
    },
    {
        message: 'Dimensions is required for embedding models',
        path: ['dimensions'],
    }
);

type ModelFormData = z.infer<typeof modelFormSchema>;

// ============================================================================
// Component Props
// ============================================================================

interface ModelFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    providerId: string;
    providerName: string;
    model?: AIProviderModelResponse; // If provided, we're editing
    onSubmit: (data: ModelFormData) => Promise<void>;
    isSubmitting?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ModelFormDialog({
    open,
    onOpenChange,
    providerId,
    providerName,
    model,
    onSubmit,
    isSubmitting = false,
}: ModelFormDialogProps) {
    const isEdit = !!model;

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<ModelFormData>({
        resolver: zodResolver(modelFormSchema),
        defaultValues: {
            modelKey: '',
            displayName: '',
            description: '',
            modelType: 'chat',
            dimensions: undefined,
            isAvailable: true,
            inputCostPerMillionTokens: undefined,
            outputCostPerMillionTokens: undefined,
            usesCompletionTokens: false,
            noTemperature: false,
        },
    });

    const modelType = watch('modelType');
    const modelKey = watch('modelKey');
    const isEmbedding = modelType === 'embedding';

    // Reset form when dialog opens/closes or model changes
    useEffect(() => {
        if (open) {
            if (model) {
                const capabilities = model.capabilities as Record<string, unknown> || {};
                reset({
                    modelKey: model.modelKey,
                    displayName: model.displayName,
                    description: model.description || '',
                    modelType: model.modelType as 'text' | 'chat' | 'embedding' | 'vision',
                    dimensions: model.dimensions || undefined,
                    isAvailable: model.isAvailable,
                    inputCostPerMillionTokens: model.inputCostPerMillionTokens || undefined,
                    outputCostPerMillionTokens: model.outputCostPerMillionTokens || undefined,
                    usesCompletionTokens: capabilities.usesCompletionTokens === true,
                    noTemperature: capabilities.noTemperature === true,
                });
            } else {
                reset({
                    modelKey: '',
                    displayName: '',
                    description: '',
                    modelType: 'chat',
                    dimensions: undefined,
                    isAvailable: true,
                    inputCostPerMillionTokens: undefined,
                    outputCostPerMillionTokens: undefined,
                    usesCompletionTokens: false,
                    noTemperature: false,
                });
            }
        }
    }, [open, model, reset]);

    // Auto-generate display name from model key
    const handleAutoGenerateDisplayName = () => {
        if (modelKey) {
            // Convert model key to display name
            // e.g., "gpt-4o-mini" -> "GPT 4o Mini"
            const displayName = modelKey
                .split(/[-_.]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            setValue('displayName', displayName);
        }
    };

    const onFormSubmit = async (data: ModelFormData) => {
        await onSubmit(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? 'Edit Model' : 'Add Model'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? `Update model configuration for ${providerName}`
                            : `Add a new model to ${providerName}`
                        }
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
                    {/* Model Key */}
                    <div className="space-y-2">
                        <Label htmlFor="modelKey">
                            Model Key <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="modelKey"
                            placeholder="e.g., gpt-4o, claude-3-opus, llama3.2"
                            {...register('modelKey')}
                            disabled={isEdit} // Can't change key after creation
                            className={cn(errors.modelKey && 'border-red-500')}
                        />
                        {errors.modelKey && (
                            <p className="text-sm text-red-500">{errors.modelKey.message}</p>
                        )}
                        <p className="text-xs text-slate-500">
                            The exact model identifier used by the provider&apos;s API
                        </p>
                    </div>

                    {/* Display Name */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="displayName">
                                Display Name <span className="text-red-500">*</span>
                            </Label>
                            {!isEdit && modelKey && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAutoGenerateDisplayName}
                                    className="h-6 text-xs text-slate-500 hover:text-slate-700"
                                >
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Auto-generate
                                </Button>
                            )}
                        </div>
                        <Input
                            id="displayName"
                            placeholder="e.g., GPT-4o, Claude 3 Opus"
                            {...register('displayName')}
                            className={cn(errors.displayName && 'border-red-500')}
                        />
                        {errors.displayName && (
                            <p className="text-sm text-red-500">{errors.displayName.message}</p>
                        )}
                    </div>

                    {/* Model Type */}
                    <div className="space-y-2">
                        <Label htmlFor="modelType">
                            Model Type <span className="text-red-500">*</span>
                        </Label>
                        <Select
                            value={modelType}
                            onValueChange={(value) => setValue('modelType', value as ModelFormData['modelType'])}
                            disabled={isEdit} // Can't change model type after creation
                        >
                            <SelectTrigger className={cn(
                                errors.modelType && 'border-red-500',
                                isEdit && 'opacity-60 cursor-not-allowed'
                            )}>
                                <SelectValue placeholder="Select model type" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(MODEL_TYPE_CONFIG).map(([key, config]) => {
                                    const Icon = config.icon;
                                    return (
                                        <SelectItem key={key} value={key}>
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                <span>{config.label}</span>
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                        {isEdit && (
                            <p className="text-xs text-slate-500">Model type cannot be changed after creation</p>
                        )}
                        {errors.modelType && (
                            <p className="text-sm text-red-500">{errors.modelType.message}</p>
                        )}
                    </div>

                    {/* Dimensions (only for embedding models) */}
                    {isEmbedding && (
                        <div className="space-y-2">
                            <Label htmlFor="dimensions">
                                Dimensions <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="dimensions"
                                type="number"
                                placeholder="e.g., 1536, 3072"
                                {...register('dimensions', { valueAsNumber: true })}
                                className={cn(errors.dimensions && 'border-red-500')}
                            />
                            {errors.dimensions && (
                                <p className="text-sm text-red-500">{errors.dimensions.message}</p>
                            )}
                            <p className="text-xs text-slate-500">
                                The number of dimensions in the embedding vector
                            </p>
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Optional description of the model's capabilities..."
                            {...register('description')}
                            rows={2}
                            className={cn(errors.description && 'border-red-500')}
                        />
                        {errors.description && (
                            <p className="text-sm text-red-500">{errors.description.message}</p>
                        )}
                    </div>

                    {/* Pricing Section */}
                    <div className="space-y-3 rounded-lg border p-3 bg-slate-50">
                        <div>
                            <Label className="text-sm font-medium">Pricing (for cost estimation)</Label>
                            <p className="text-xs text-slate-500">
                                Optional: Configure pricing to estimate AI costs in analytics
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* Input Cost */}
                            <div className="space-y-1">
                                <Label htmlFor="inputCostPerMillionTokens" className="text-xs">
                                    Input Cost (USD/1M tokens)
                                </Label>
                                <Input
                                    id="inputCostPerMillionTokens"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="e.g., 0.15"
                                    {...register('inputCostPerMillionTokens', { valueAsNumber: true })}
                                    className={cn(
                                        'h-8 text-sm',
                                        errors.inputCostPerMillionTokens && 'border-red-500'
                                    )}
                                />
                                {errors.inputCostPerMillionTokens && (
                                    <p className="text-xs text-red-500">
                                        {errors.inputCostPerMillionTokens.message}
                                    </p>
                                )}
                            </div>

                            {/* Output Cost */}
                            <div className="space-y-1">
                                <Label htmlFor="outputCostPerMillionTokens" className="text-xs">
                                    Output Cost (USD/1M tokens)
                                </Label>
                                <Input
                                    id="outputCostPerMillionTokens"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="e.g., 0.60"
                                    {...register('outputCostPerMillionTokens', { valueAsNumber: true })}
                                    className={cn(
                                        'h-8 text-sm',
                                        errors.outputCostPerMillionTokens && 'border-red-500'
                                    )}
                                />
                                {errors.outputCostPerMillionTokens && (
                                    <p className="text-xs text-red-500">
                                        {errors.outputCostPerMillionTokens.message}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* OpenAI Capabilities Section (only for chat/text models) */}
                    {(modelType === 'chat' || modelType === 'text') && (
                        <div className="space-y-3 rounded-lg border p-3 bg-blue-50/50">
                            <div>
                                <Label className="text-sm font-medium">OpenAI Model Options</Label>
                                <p className="text-xs text-slate-500">
                                    Configure OpenAI-specific model behavior
                                </p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="usesCompletionTokens" className="text-sm">
                                        Uses Completion Tokens
                                    </Label>
                                    <p className="text-xs text-slate-500">
                                        Enable for newer models (o1, o3, gpt-5) that use max_completion_tokens
                                    </p>
                                </div>
                                <Switch
                                    id="usesCompletionTokens"
                                    checked={watch('usesCompletionTokens')}
                                    onCheckedChange={(checked) => setValue('usesCompletionTokens', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="noTemperature" className="text-sm">
                                        No Temperature Support
                                    </Label>
                                    <p className="text-xs text-slate-500">
                                        Enable for reasoning models that don&apos;t support temperature parameter
                                    </p>
                                </div>
                                <Switch
                                    id="noTemperature"
                                    checked={watch('noTemperature')}
                                    onCheckedChange={(checked) => setValue('noTemperature', checked)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Is Available */}
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <Label htmlFor="isAvailable">Available</Label>
                            <p className="text-xs text-slate-500">
                                Make this model available for selection
                            </p>
                        </div>
                        <Switch
                            id="isAvailable"
                            checked={watch('isAvailable')}
                            onCheckedChange={(checked) => setValue('isAvailable', checked)}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {isEdit ? 'Updating...' : 'Adding...'}
                                </>
                            ) : (
                                isEdit ? 'Update Model' : 'Add Model'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default ModelFormDialog;