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
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
import { cn } from '@/lib/utils';
import { ModelFormDialog } from './ModelFormDialog';
import { aiModelsApi } from '../_lib/api-client';
import type {
    AIProviderWithModelsResponse,
    AIProviderModelResponse,
    CreateAIModelInput,
    UpdateAIModelInput,
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
    chat: 'bg-blue-50 text-blue-700 border-blue-200',
    text: 'bg-purple-50 text-purple-700 border-purple-200',
    embedding: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    vision: 'bg-amber-50 text-amber-700 border-amber-200',
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
                ? "bg-white border-slate-200 hover:border-slate-300"
                : "bg-slate-50 border-slate-200/70"
        )}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Model Type Icon */}
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md border",
                    MODEL_TYPE_COLORS[model.modelType] || 'bg-slate-50 text-slate-600 border-slate-200'
                )}>
                    {MODEL_TYPE_ICONS[model.modelType] || <FileText className="h-3.5 w-3.5" />}
                </div>

                {/* Model Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "font-medium text-sm truncate",
                            model.isAvailable ? "text-slate-900" : "text-slate-500"
                        )}>
                            {model.displayName}
                        </span>
                        {model.isDiscovered && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-violet-50 text-violet-600 border-violet-200">
                                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                Discovered
                            </Badge>
                        )}
                        {!model.isAvailable && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-500 border-slate-200">
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
                <Switch
                    checked={model.isAvailable}
                    onCheckedChange={(checked) => onToggleAvailable(model, checked)}
                    disabled={isUpdating}
                    className="data-[state=checked]:bg-emerald-500"
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
                        <DropdownMenuItem onClick={() => onEdit(model)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDelete(model)}
                            className="text-red-600 focus:text-red-600"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
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
            toast.error('Failed to delete model');
            console.error('Delete model error:', error);
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
            toast.error('Failed to update model');
            console.error('Update model error:', error);
        } finally {
            setUpdatingModelId(null);
        }
    };

    // Handle form submit (create or update)
    const handleFormSubmit = async (data: {
        modelKey: string;
        displayName: string;
        description?: string | null;
        modelType: 'text' | 'chat' | 'embedding' | 'vision';
        dimensions?: number | null;
        isAvailable: boolean;
        inputCostPerMillionTokens?: number | null;
        outputCostPerMillionTokens?: number | null;
        usesCompletionTokens?: boolean;
        noTemperature?: boolean;
    }) => {
        setIsSubmitting(true);
        try {
            // Build capabilities object from flat form fields
            const capabilities: Record<string, unknown> = {};
            if (data.usesCompletionTokens) {
                capabilities.usesCompletionTokens = true;
            }
            if (data.noTemperature) {
                capabilities.noTemperature = true;
            }

            if (editingModel) {
                // Update existing model (modelType cannot be changed after creation)
                const updateData: UpdateAIModelInput = {
                    displayName: data.displayName,
                    description: data.description,
                    // Only update dimensions if it's an embedding model
                    dimensions: editingModel.modelType === 'embedding' ? data.dimensions : undefined,
                    isAvailable: data.isAvailable,
                    inputCostPerMillionTokens: data.inputCostPerMillionTokens,
                    outputCostPerMillionTokens: data.outputCostPerMillionTokens,
                    capabilities,
                };
                await aiModelsApi.update(editingModel.id, updateData);
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
                    capabilities,
                };
                await aiModelsApi.create(createData);
                toast.success(`Model "${data.displayName}" added`);
            }
            onModelsChanged();
            setModelFormOpen(false);
        } catch (error) {
            toast.error(editingModel ? 'Failed to update model' : 'Failed to add model');
            console.error('Model form error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Manage Models
                            <Badge variant="outline" className="font-normal">
                                {models.length} {models.length === 1 ? 'model' : 'models'}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            Add, edit, or remove models for {provider.displayName}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handleAddModel}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add Model
                            </Button>
                            {isOllama && onDiscoverModels && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onDiscoverModels}
                                    disabled={isDiscovering}
                                >
                                    {isDiscovering ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                            Discovering...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="h-4 w-4 mr-1" />
                                            Discover Models
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Models List */}
                    <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
                        {models.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                    <Database className="h-6 w-6 text-slate-400" />
                                </div>
                                <p className="text-slate-600 font-medium">No models configured</p>
                                <p className="text-sm text-slate-400 mt-1 mb-4">
                                    {isOllama
                                        ? 'Discover models from Ollama or add them manually'
                                        : 'Add models to start using this provider'
                                    }
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <Button size="sm" onClick={handleAddModel}>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add Model
                                    </Button>
                                    {isOllama && onDiscoverModels && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={onDiscoverModels}
                                            disabled={isDiscovering}
                                        >
                                            <Search className="h-4 w-4 mr-1" />
                                            Discover
                                        </Button>
                                    )}
                                </div>
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
                        <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
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