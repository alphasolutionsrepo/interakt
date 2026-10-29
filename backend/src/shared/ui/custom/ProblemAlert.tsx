'use client';

// src/shared/ui/custom/ProblemAlert.tsx
//
// A failed action, shown where the user acted (above a form's submit button, in a
// dialog). It stays until dismissed or the next submit: what went wrong, what to
// try, and the technical details collapsed. Pair it with meta: { inlineError: true }
// on the mutation so no separate notice appears (see shared/activity/report.ts).

import { AlertCircle, X } from 'lucide-react';

import { ErrorDetails } from './ErrorDetails';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { errorEntry, entryAsText } from '@/shared/activity/activity-store';
import { ApiError } from '@/shared/api/api-error';

export interface ProblemAlertProps {
  /** What was thrown: an ApiError shows its hint and details; anything else its message */
  error: unknown;
  /** Heading, e.g. "Couldn't save the field". Defaults to the error message alone */
  title?: string;
  onDismiss?: () => void;
  /** Field errors already shown next to their fields, not repeated here */
  hideFields?: string[];
  className?: string;
}

export function ProblemAlert({ error, title, onDismiss, hideFields, className }: ProblemAlertProps) {
  if (!error) return null;
  const entry = errorEntry(title ?? 'Action', error);
  const fields = error instanceof ApiError ? (error.fields ?? []).filter((f) => !hideFields?.includes(f.field)) : [];

  return (
    <Alert variant="destructive" className={cn('pr-9', className)}>
      <AlertCircle />
      <AlertTitle className="line-clamp-none">{title ?? entry.message}</AlertTitle>
      <AlertDescription className="w-full">
        {title && <p className="text-foreground">{entry.message}</p>}
        {entry.hint && <p>{entry.hint}</p>}
        {/* Field problems the form couldn't put next to a field */}
        {fields.length > 0 && (
          <ul className="list-inside list-disc text-foreground">
            {fields.map((f, i) => (
              <li key={i}>{f.field ? `${f.field}: ${f.message}` : f.message}</li>
            ))}
          </ul>
        )}
        <ErrorDetails
          code={entry.code}
          httpStatus={entry.httpStatus}
          details={entry.details}
          requestId={entry.requestId}
          copyText={entryAsText({ ...entry, id: '', at: new Date().toISOString(), read: true })}
        />
      </AlertDescription>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </Alert>
  );
}
