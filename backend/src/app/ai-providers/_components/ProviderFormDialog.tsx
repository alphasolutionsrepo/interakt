// app/ai-providers/_components/ProviderFormDialog.tsx

'use client';

import { useEffect , useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/shared/validation/zod';
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
import { useQuery } from '@tanstack/react-query';
import { chosenSecretOf, initialKeySource, keyFieldsToSend } from '../_lib/key-source';
import { secretsApi } from '@/app/secrets/_lib/api-client';
import type { AIProviderWithModelsResponse } from '@/features/ai-providers';
import { useInlineError } from '@/shared/activity/useInlineError';
import { useAccess } from '@/shared/access/useAccess';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';

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
    connectionType: z.enum(['openai_compatible', 'ollama']),
    authType: z.enum(['api_key', 'none', 'oauth']),
    baseUrl: z.string()
        .url('Must be a valid URL')
        .max(500, 'URL too long'),
    // Where the key comes from: typed here (saved in the Secrets Vault), or a vault secret
    keySource: z.enum(['typed', 'secret']).default('typed'),
    apiKey: z.string()
        .max(500, 'API key too long')
        .optional()
        .nullable(),
    apiKeySecret: z.string().optional().nullable(),
    isEnabled: z.boolean().default(false),
}).refine(
    (d) => d.authType !== 'api_key' || d.keySource !== 'secret' || !!d.apiKeySecret,
    { message: 'Choose a secret from the vault', path: ['apiKeySecret'] },
);

type ProviderFormData = z.output<typeof providerFormSchema>;
/** What the form sends: the key as keyFieldsToSend decides, never both a key and a secret */
export type ProviderFormPayload = Omit<ProviderFormData, 'keySource' | 'apiKey' | 'apiKeySecret'> & { apiKey?: string; apiKeySecret?: string };
type ProviderFormInput = z.input<typeof providerFormSchema>;
type ConnectionType = ProviderFormData['connectionType'];

/** What each connection type covers, and the base URL it expects. */
const CONNECTION_TYPES: Record<ConnectionType, { label: string; description: string; baseUrlExample: string; baseUrlHint: string }> = {
    openai_compatible: {
        label: 'OpenAI-compatible',
        description: 'OpenAI, AI gateways and routers, vLLM, LM Studio and other services with an OpenAI-style /v1 API.',
        baseUrlExample: 'https://api.openai.com/v1',
        baseUrlHint: 'The address up to and including /v1, for example https://ai.example.edu/v1',
    },
    ollama: {
        label: 'Ollama',
        description: "Ollama's own API.",
        baseUrlExample: 'http://localhost:11434',
        baseUrlHint: "Ollama's address, without /v1",
    },
};

/** A provider key made from its name: lowercase letters, digits and hyphens, starting with a letter. */
export function providerKeyFor(name: string): string {
    return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 50);
}

// ============================================================================
// Component
// ============================================================================

interface ProviderFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    provider?: AIProviderWithModelsResponse | null;
    onSubmit: (data: ProviderFormPayload) => Promise<void>;
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
    const inline = useInlineError();
    // Choosing a vault secret sends its value to this provider's server: it needs secrets:manage
    const canChooseSecret = useAccess().can('secrets:manage');

    const form = useForm<ProviderFormInput, unknown, ProviderFormData>({
        resolver: zodResolver(providerFormSchema),
        defaultValues: {
            providerKey: '',
            displayName: '',
            description: '',
            providerType: 'cloud',
            connectionType: 'openai_compatible',
            authType: 'api_key',
            baseUrl: '',
            keySource: 'typed',
            apiKey: '',
            apiKeySecret: '',
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
                connectionType: provider.connectionType,
                authType: provider.authType,
                baseUrl: provider.baseUrl,
                keySource: initialKeySource(provider),
                apiKey: '', // Don't prefill API key for security
                apiKeySecret: chosenSecretOf(provider),
                isEnabled: provider.isEnabled,
            });
        } else if (mode === 'create') {
            form.reset({
                providerKey: '',
                displayName: '',
                description: '',
                providerType: 'cloud',
                connectionType: 'openai_compatible',
                authType: 'api_key',
                baseUrl: '',
                keySource: 'typed',
                apiKey: '',
                apiKeySecret: '',
                isEnabled: false,
            });
        }
    }, [provider, mode, form]);

    // A failed save from last time is not shown again
    const clearInlineError = inline.clear;
    useEffect(() => {
        if (open) clearInlineError();
    }, [open, clearInlineError]);

    const handleSubmit = async (data: ProviderFormData) => {
        inline.clear();
        try {
            const { keySource, apiKey, apiKeySecret, ...rest } = data;
            const key = rest.authType === 'api_key'
                ? keyFieldsToSend({ source: keySource, apiKey, apiKeySecret, baseUrl: rest.baseUrl, provider: mode === 'edit' ? provider : null })
                : {};
            await onSubmit({ ...rest, ...key });
            onOpenChange(false);
        } catch (err) {
            inline.capture(mode === 'create' ? 'Create provider' : 'Update provider', err, form);
        }
    };

    const connectionType = form.watch('connectionType');
    const authType = form.watch('authType');
    const keySource = form.watch('keySource');
    const providerKey = form.watch('providerKey');
    // The vault's secrets, to choose one by name (only for a role that may)
    const vaultSecrets = useQuery({
        queryKey: ['secrets', 'list', { search: undefined }],
        queryFn: () => secretsApi.list(),
        enabled: open && canChooseSecret && authType === 'api_key' && keySource === 'secret',
    });
    // Where a typed key is kept: the provider's own vault secret, or the one it will get
    const ownSecret = provider?.apiKeySecretManaged ? provider.apiKeySecret : null;

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
                                                placeholder="campus-ai"
                                                {...field}
                                                onChange={(e) => form.setValue('providerKey', e.target.value, { shouldDirty: true, shouldValidate: true })}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Unique identifier, made from the name (lowercase, no spaces)
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
                                        <Input
                                            placeholder="Campus AI"
                                            {...field}
                                            onChange={(e) => {
                                                field.onChange(e);
                                                // The key follows the name until the admin edits the key
                                                if (mode === 'create' && !form.getFieldState('providerKey').isDirty) {
                                                    form.setValue('providerKey', providerKeyFor(e.target.value));
                                                }
                                            }}
                                        />
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

                        {/* Connection type: the API the provider speaks, whatever it is called */}
                        <FormField
                            control={form.control}
                            name="connectionType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Connection type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select connection type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {(Object.keys(CONNECTION_TYPES) as ConnectionType[]).map((type) => (
                                                <SelectItem key={type} value={type}>{CONNECTION_TYPES[type].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>{CONNECTION_TYPES[field.value].description}</FormDescription>
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

                        {/* Auth Type: editable too, since a changed connection type can need a key */}
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
                                    {mode === 'edit' && provider?.hasApiKey && field.value === 'none' && (
                                        <FormDescription>Saving removes the saved API key.</FormDescription>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Base URL */}
                        <FormField
                            control={form.control}
                            name="baseUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Base URL</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={CONNECTION_TYPES[connectionType].baseUrlExample}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {CONNECTION_TYPES[connectionType].baseUrlHint}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* API Key: typed (saved in the Secrets Vault) or a vault secret */}
                        {authType === 'api_key' && (
                            <FormField
                                control={form.control}
                                name="keySource"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>API key from</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="typed">A key entered here</SelectItem>
                                                <SelectItem value="secret" disabled={!canChooseSecret}>A secret in the Secrets Vault</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {!canChooseSecret && (
                                            <FormDescription>
                                                Choosing a vault secret needs a role that can manage secrets (Admin → Roles).
                                            </FormDescription>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {authType === 'api_key' && keySource === 'typed' && (
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
                                        <FormDescription>
                                            {mode === 'edit' && provider?.hasApiKey
                                                ? <>Leave empty to keep the saved key{provider.apiKeySecret ? <> (vault secret <code>{provider.apiKeySecret}</code>)</> : null}. A base URL on another server needs the key again.</>
                                                : <>Saved in the Secrets Vault as <code>{ownSecret ?? `ai_provider_${(providerKey || 'provider-key').replace(/-/g, '_')}`}</code>.</>}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {authType === 'api_key' && keySource === 'secret' && (
                            <FormField
                                control={form.control}
                                name="apiKeySecret"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Vault secret</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={vaultSecrets.isLoading ? 'Loading secrets…' : 'Choose a secret'} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {(vaultSecrets.data ?? []).map((s) => (
                                                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            {vaultSecrets.data && vaultSecrets.data.length === 0
                                                ? 'The Secrets Vault has no secrets yet: add one there (Admin → Secrets Vault), or enter a key here instead.'
                                                : 'Its value is sent to this provider as the API key. A base URL on another server needs it chosen again.'}
                                        </FormDescription>
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

                        <ProblemAlert error={inline.error} hideFields={inline.hideFields} onDismiss={inline.clear} />

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