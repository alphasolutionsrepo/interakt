// src/shared/ui/custom/DialogFormFooter.tsx

'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import type { useInlineError } from '@/shared/activity/useInlineError';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';

interface DialogFormFooterProps {
  /** The dialog's inline error (useInlineError): shown above the buttons when a save failed */
  inline: ReturnType<typeof useInlineError>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
}

/** The end of a form dialog: why the last save failed, then Cancel and the submit button. */
export function DialogFormFooter({ inline, onCancel, submitLabel, isSubmitting, submitDisabled }: DialogFormFooterProps) {
  return (
    <>
      <ProblemAlert error={inline.error} hideFields={inline.hideFields} onDismiss={inline.clear} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="rounded-lg">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || submitDisabled} className="rounded-lg">
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
