// src/shared/ui/custom/DeleteConfirmDialog/DeleteConfirmDialog.tsx
'use client';

import * as React from 'react';
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
import { Loader2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface DeleteConfirmDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void;
    /** The name of the item being deleted (for display) */
    itemName?: string;
    /** Custom title */
    title?: string;
    /** Custom description */
    description?: string;
    /** Called when delete is confirmed */
    onConfirm: () => void | Promise<void>;
    /** Loading state */
    isLoading?: boolean;
    /** Custom confirm button text */
    confirmText?: string;
    /** Custom cancel button text */
    cancelText?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeleteConfirmDialog({
    open,
    onOpenChange,
    itemName,
    title = 'Delete Item',
    description,
    onConfirm,
    isLoading = false,
    confirmText = 'Delete',
    cancelText = 'Cancel',
}: DeleteConfirmDialogProps) {
    const [isDeleting, setIsDeleting] = React.useState(false);

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch (error) {
            // Error should be handled by parent
            console.error('Delete failed:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const isProcessing = isLoading || isDeleting;

    const defaultDescription = itemName
        ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
        : 'Are you sure you want to delete this item? This action cannot be undone.';

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description || defaultDescription}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isProcessing}>
                        {cancelText}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="bg-red-500 text-white hover:bg-red-600 focus:ring-red-500"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            confirmText
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DeleteConfirmDialog;