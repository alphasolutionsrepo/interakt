'use client';

import { useFormStatus } from 'react-dom';

import { LoaderIcon } from '@/components/custom/icons';
import { Button } from '../components/button';

export function SubmitButton({
  children,
  isSuccessful,
  isLoading = false,
}: {
  children: React.ReactNode;
  isSuccessful: boolean;
  isLoading?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || isSuccessful || isLoading;

  return (
    <Button
      type={isDisabled ? 'button' : 'submit'}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className="relative"
    >
      {children}

      {(pending || isSuccessful || isLoading) && (
        <span className="animate-spin absolute right-4">
          <LoaderIcon />
        </span>
      )}

      <output aria-live="polite" className="sr-only">
        {isDisabled ? 'Loading' : 'Submit form'}
      </output>
    </Button>
  );
}
