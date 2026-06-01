// app/ai-providers/_components/ProviderFormDialog.tsx

'use client';

import { useEffect , useState } from 'react';
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
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import type { AIProviderWithModelsResponse } from '@/features/ai-providers';

// ============================================================================
// Form Schema
// ============================================================================

const providerFormSchema = z.object({
    providerKey: z.string()
        .min(1, 'Provider key is required')
        .max(50, 'Provider key too long')
        .regex(/^[a-z][a-z0-9_-]*$/, 'Must be lowercase alphanumeric with underscores/hyphens'),
    displayName: z.string()
        .min(1, 'Display name is required')
        .max(100, 'Display name too long'),
    description: z.string()
        .max(1000, 'Description too long')
        .optional(),
    providerType: z.enum(['cloud', 'local']),
    authType: z.enum(['api_key', 'none', 'oauth']),
    baseUrl: z.string()
        .url('Must be a valid URL')
        .max(500, 'URL too long'),
    apiKey: z.string()
        .max(500, 'API key too long')
        .optional()
        .nullable(),
    isEnabled: z.boolean().default(false),
});

type ProviderFormData = z.infer<typeof providerFormSchema>;

// ============================================================================
// Component
// ============================================================================

interface ProviderFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    provider?: AIProviderWithModelsResponse | null;
    onSubmit: (data: ProviderFormData) => Promise<void>;
    isSubmitting?: boolean;
    mode: 'create' | 'edit';
}

export function ProviderFormDialog({
    open,
    onOpenChange,
    provider,
    onSubmit,
    isSubmitting,
    mode,
}: ProviderFormDialogProps) {
    const [showApiKey, setShowApiKey] = useState(false);

    const form = useForm<ProviderFormData>({
        resolver: zodResolver(providerFormSchema),
        defaultValues: {
            providerKey: '',
            displayName: '',
            description: '',
            providerType: 'cloud',
            authType: 'api_key',
            baseUrl: '',
            apiKey: '',
            isEnabled: false,
        },
    });

    // Reset form when provider changes
    useEffect(() => {
        if (provider && mode === 'edit') {
            form.reset({
                providerKey: provider.providerKey,
                displayName: provider.displayName,
                description: provider.description ?? '',
                providerType: provider.providerType,
                authType: provider.authType,
                baseUrl: provider.baseUrl,
                apiKey: '', // Don't prefill API key for security
                isEnabled: provider.isEnabled,
            });
        } else if (mode === 'create') {
            form.reset({
                providerKey: '',
                displayName: '',
                description: '',
                providerType: 'cloud',
                authType: 'api_key',
                baseUrl: '',
                apiKey: '',
                isEnabled: false,
            });
        }
    }, [provider, mode, form]);

    const handleSubmit = async (data: ProviderFormData) => {
        await onSubmit(data);
        onOpenChange(false);
    };

    const providerType = form.watch('providerType');
    const authType = form.watch('authType');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? 'Add AI Provider' : 'Edit AI Provider'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'Configure a new AI provider connection.'
                            : 'Update the provider configuration.'}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        {/* Provider Key (only for create) */}
                        {mode === 'create' && (
                            <FormField
                                control={form.control}
                                name="providerKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Provider Key</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="my-provider"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Unique identifier (lowercase, no spaces)
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* Display Name */}
                        <FormField
                            control={form.control}
                            name="displayName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Display Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="My AI Provider" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Description */}
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Optional description..."
                                            className="resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Provider Type (only for create) */}
                        {mode === 'create' && (
                            <FormField
                                control={form.control}
                                name="providerType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Provider Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="cloud">Cloud (External API)</SelectItem>
                                                <SelectItem value="local">Local (Self-hosted)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* Auth Type (only for create) */}
                        {mode === 'create' && (
                            <FormField
                                control={form.control}
                                name="authType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Authentication</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select auth type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="api_key">API Key</SelectItem>
                                                <SelectItem value="none">None (Local)</SelectItem>
                                                <SelectItem value="oauth">OAuth</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* Base URL */}
                        <FormField
                            control={form.control}
                            name="baseUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Base URL</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={providerType === 'local'
                                                ? 'http://localhost:11434'
                                                : 'https://api.openai.com/v1'}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        API endpoint URL
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* API Key */}
                        {authType === 'api_key' && (
                            <FormField
                                control={form.control}
                                name="apiKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>API Key</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? 'text' : 'password'}
                                                    placeholder={mode === 'edit' && provider?.hasApiKey
                                                        ? '••••••••••••••••'
                                                        : 'sk-...'}
                                                    {...field}
                                                    value={field.value ?? ''}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                >
                                                    {showApiKey ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </FormControl>
                                        {mode === 'edit' && provider?.hasApiKey && (
                                            <FormDescription>
                                                Leave empty to keep existing key
                                            </FormDescription>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* Enabled Toggle */}
                        <FormField
                            control={form.control}
                            name="isEnabled"
                            render={({ field }) => (
                                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Enabled</FormLabel>
                                        <FormDescription>
                                            Enable this provider for use
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {mode === 'create' ? 'Create Provider' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}