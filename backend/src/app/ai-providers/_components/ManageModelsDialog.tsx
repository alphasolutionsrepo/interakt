// app/ai-providers/_components/ManageModelsDialog.tsx

'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Plus,
    MoreHorizontal,
    Pencil,
    Trash2,
    MessageSquare,
    FileText,
    Database,
    Eye,
    Loader2,
    Search,
    Sparkles,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { reportActionError } from '@/shared/activity/report';
import { cn } from '@/lib/utils';
import { ActionButton, ActionMenuItem, ActionSwitch } from '@/shared/access/ActionControls';
import { useAccess } from '@/shared/access/useAccess';
import { ModelFormDialog } from './ModelFormDialog';
import { aiModelsApi } from '../_lib/api-client';
import { capabilitiesFromForm } from '../_lib/model-capabilities';
import { modelUpdateInput, type ModelFormSubmission } from '../_lib/model-form';
import type {
    AIProviderWithModelsResponse,
    AIProviderModelResponse,
    CreateAIModelInput,
} from '@/features/ai-providers';

// ============================================================================
// Model Type Icons
// ============================================================================

const MODEL_TYPE_ICONS: Record<string, React.ReactNode> = {
    chat: <MessageSquare className="h-3.5 w-3.5" />,
    text: <FileText className="h-3.5 w-3.5" />,
    embedding: <Database className="h-3.5 w-3.5" />,
    vision: <Eye className="h-3.5 w-3.5" />,
};

const MODEL_TYPE_COLORS: Record<string, string> = {
    chat: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    text: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    embedding: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    vision: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

// ============================================================================
// Component Props
// ============================================================================

interface ManageModelsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    provider: AIProviderWithModelsResponse;
    onModelsChanged: () => void; // Callback to refresh parent data
    onDiscoverModels?: () => void; // For Ollama auto-discovery
    isDiscovering?: boolean;
}

// ============================================================================
// Model Row Component
// ============================================================================

interface ModelRowProps {
    model: AIProviderModelResponse;
    onEdit: (model: AIProviderModelResponse) => void;
    onDelete: (model: AIProviderModelResponse) => void;
    onToggleAvailable: (model: AIProviderModelResponse, available: boolean) => void;
    isUpdating: boolean;
}

function ModelRow({ model, onEdit, onDelete, onToggleAvailable, isUpdating }: ModelRowProps) {
    return (
        <div className={cn(
            "group flex items-center justify-between p-3 rounded-lg border transition-colors",
            model.isAvailable
                ? "bg-white dark:bg-card border-slate-200 dark:border-border hover:border-slate-300"
                : "bg-slate-50 dark:bg-muted/40 border-slate-200/70 dark:border-border"
        )}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Model Type Icon */}
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md border",
                    MODEL_TYPE_COLORS[model.modelType] || 'bg-slate-50 dark:bg-muted/40 text-slate-600 border-slate-200 dark:border-border'
                )}>
                    {MODEL_TYPE_ICONS[model.modelType] || <FileText className="h-3.5 w-3.5" />}
                </div>

                {/* Model Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "font-medium text-sm truncate",
                            model.isAvailable ? "text-slate-900 dark:text-foreground" : "text-slate-500"
                        )}>
                            {model.displayName}
                        </span>
                        {model.isDiscovered && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-violet-50 dark:bg-violet-950/40 text-violet-600 border-violet-200 dark:border-violet-800">
                                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                Discovered
                            </Badge>
                        )}
                        {!model.isAvailable && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 dark:bg-muted text-slate-500 border-slate-200 dark:border-border">
                                Disabled
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs text-slate-400 font-mono truncate">
                            {model.modelKey}
                        </code>
                        {model.modelType === 'embedding' && model.dimensions && (
                            <span className="text-xs text-slate-400">
                                • {model.dimensions}d
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-2">
                {/* Available Toggle */}
                <ActionSwitch
                    action="ai-models.change"
                    checked={model.isAvailable}
                    onCheckedChange={(checked) => onToggleAvailable(model, checked)}
                    disabled={isUpdating}
                    className="data-[state=checked]:bg-emerald-500"
                    aria-label={`${model.displayName} available`}
                />

                {/* Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <ActionMenuItem action="ai-models.change" icon={Pencil} iconClassName="h-4 w-4 mr-2" onClick={() => onEdit(model)}>
                            Edit
                        </ActionMenuItem>
                        <DropdownMenuSeparator />
                        <ActionMenuItem
                            action="ai-models.change"
                            icon={Trash2}
                            iconClassName="h-4 w-4 mr-2"
                            onClick={() => onDelete(model)}
                            className="text-red-600 focus:text-red-600"
                        >
                            Delete
                        </ActionMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

/** Add Model and, for Ollama, Discover Models; locked with the reason for someone who may not. */
function ModelActions({ onAdd, onDiscover, isDiscovering }: {
    onAdd: () => void;
    /** Set only when discovery applies (Ollama) */
    onDiscover?: () => void;
    isDiscovering: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <ActionButton action="ai-models.change" icon={Plus} iconClassName="h-4 w-4 mr-1" size="sm" onClick={onAdd}>
                Add Model
            </ActionButton>
            {onDiscover && (
                <ActionButton
                    action="ai-providers.discover-models"
                    icon={isDiscovering ? Loader2 : Search}
                    iconClassName={isDiscovering ? 'h-4 w-4 mr-1 animate-spin' : 'h-4 w-4 mr-1'}
                    size="sm"
                    variant="outline"
                    onClick={onDiscover}
                    disabled={isDiscovering}
                >
                    {isDiscovering ? 'Discovering...' : 'Discover Models'}
                </ActionButton>
            )}
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function ManageModelsDialog({
    open,
    onOpenChange,
    provider,
    onModelsChanged,
    onDiscoverModels,
    isDiscovering = false,
}: ManageModelsDialogProps) {
    const [modelFormOpen, setModelFormOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<AIProviderModelResponse | undefined>();
    const [deletingModel, setDeletingModel] = useState<AIProviderModelResponse | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [updatingModelId, setUpdatingModelId] = useState<number | null>(null);

    const models = provider.models || [];
    const isOllama = provider.providerKey === 'ollama';
    const { canDo } = useAccess();
    const canChange = canDo('ai-models.change');
    const discover = isOllama ? onDiscoverModels : undefined;

    // Handle add model
    const handleAddModel = () => {
        setEditingModel(undefined);
        setModelFormOpen(true);
    };

    // Handle edit model
    const handleEditModel = (model: AIProviderModelResponse) => {
        setEditingModel(model);
        setModelFormOpen(true);
    };

    // Handle delete model
    const handleDeleteModel = (model: AIProviderModelResponse) => {
        setDeletingModel(model);
    };

    // Confirm delete
    const confirmDelete = async () => {
        if (!deletingModel) return;

        setIsDeleting(true);
        try {
            await aiModelsApi.delete(deletingModel.id);
            toast.success(`Model "${deletingModel.displayName}" deleted`);
            onModelsChanged();
        } catch (error) {
            reportActionError(`Delete model ${deletingModel.displayName}`, error);
        } finally {
            setIsDeleting(false);
            setDeletingModel(null);
        }
    };

    // Handle toggle available
    const handleToggleAvailable = async (model: AIProviderModelResponse, available: boolean) => {
        setUpdatingModelId(model.id);
        try {
            await aiModelsApi.update(model.id, { isAvailable: available });
            toast.success(`Model ${available ? 'enabled' : 'disabled'}`);
            onModelsChanged();
        } catch (error) {
            reportActionError(`${available ? 'Enable' : 'Disable'} model ${model.displayName}`, error);
        } finally {
            setUpdatingModelId(null);
        }
    };

    // Handle form submit (create or update)
    const handleFormSubmit = async (data: ModelFormSubmission) => {
        setIsSubmitting(true);
        try {
            if (editingModel) {
                await aiModelsApi.update(editingModel.id, modelUpdateInput(editingModel, data));
                toast.success(`Model "${data.displayName}" updated`);
            } else {
                // Create new model
                const createData: CreateAIModelInput = {
                    providerId: provider.id,
                    modelKey: data.modelKey,
                    displayName: data.displayName,
                    description: data.description,
                    modelType: data.modelType,
                    dimensions: data.modelType === 'embedding' ? data.dimensions : null,
                    isAvailable: data.isAvailable,
                    inputCostPerMillionTokens: data.inputCostPerMillionTokens,
                    outputCostPerMillionTokens: data.outputCostPerMillionTokens,
                    capabilities: capabilitiesFromForm(data),
                };
                await aiModelsApi.create(createData);
                toast.success(`Model "${data.displayName}" added`);
            }
            onModelsChanged();
            setModelFormOpen(false);
        } catch (error) {
            // The form shows the error next to its fields
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    };

    const actions = <ModelActions onAdd={handleAddModel} onDiscover={discover} isDiscovering={isDiscovering} />;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {canChange ? 'Manage Models' : 'Models'}
                            <Badge variant="outline" className="font-normal">
                                {models.length} {models.length === 1 ? 'model' : 'models'}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            {canChange ? `Add, edit, or remove models for ${provider.displayName}` : `Models for ${provider.displayName}`}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-border">
                        {actions}
                    </div>

                    {/* Models List */}
                    <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
                        {models.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-muted flex items-center justify-center mx-auto mb-3">
                                    <Database className="h-6 w-6 text-slate-400" />
                                </div>
                                <p className="text-slate-600 font-medium">No models configured</p>
                                <p className="text-sm text-slate-400 mt-1 mb-4">
                                    {isOllama && discover
                                        ? 'Discover models from Ollama or add them manually'
                                        : 'Add models to start using this provider'}
                                </p>
                                <div className="flex justify-center">{actions}</div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {models.map((model) => (
                                    <ModelRow
                                        key={model.id}
                                        model={model}
                                        onEdit={handleEditModel}
                                        onDelete={handleDeleteModel}
                                        onToggleAvailable={handleToggleAvailable}
                                        isUpdating={updatingModelId === model.id}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer Info */}
                    {models.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 dark:border-border flex items-center gap-2 text-xs text-slate-500">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>
                                {models.filter(m => m.isAvailable).length} of {models.length} models available for use
                            </span>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Model Form Dialog */}
            <ModelFormDialog
                open={modelFormOpen}
                onOpenChange={setModelFormOpen}
                providerId={provider.id}
                providerName={provider.displayName}
                model={editingModel}
                onSubmit={handleFormSubmit}
                isSubmitting={isSubmitting}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deletingModel} onOpenChange={() => setDeletingModel(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Model</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{deletingModel?.displayName}&quot;?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export default ManageModelsDialog;