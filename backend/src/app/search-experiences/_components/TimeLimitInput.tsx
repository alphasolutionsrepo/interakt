// src/app/search-experiences/_components/TimeLimitInput.tsx

/**
 * The query understanding time limit, typed in seconds and stored in ms. The admin types freely
 * ("0.", "", "1"): a value is saved as soon as it reads as a number in range, and the field is
 * brought within the range only when it loses focus, so typing is never overwritten mid-way.
 */

'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  MAX_QUERY_UNDERSTANDING_TIMEOUT_MS,
  MIN_QUERY_UNDERSTANDING_TIMEOUT_MS,
  timeoutMsFromSeconds,
  timeoutSecondsFromMs,
} from '@/features/search-experience/search-experience.types';

/** The ms to save for what is typed so far, or null while it isn't a number in range yet. */
export function typedTimeoutMs(text: string): number | null {
  const seconds = Number(text);
  if (text.trim() === '' || !Number.isFinite(seconds)) return null;
  const ms = Math.round(seconds * 1000);
  return ms >= MIN_QUERY_UNDERSTANDING_TIMEOUT_MS && ms <= MAX_QUERY_UNDERSTANDING_TIMEOUT_MS ? ms : null;
}

export function TimeLimitInput({ id, timeoutMs, onChange, disabled }: {
  id: string;
  timeoutMs: number | undefined;
  onChange: (timeoutMs: number) => void;
  disabled?: boolean;
}) {
  // What is being typed; null shows the saved value
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      id={id}
      type="number"
      min={MIN_QUERY_UNDERSTANDING_TIMEOUT_MS / 1000}
      max={MAX_QUERY_UNDERSTANDING_TIMEOUT_MS / 1000}
      step={0.5}
      disabled={disabled}
      value={text ?? String(timeoutSecondsFromMs(timeoutMs))}
      onChange={(e) => {
        setText(e.target.value);
        const ms = typedTimeoutMs(e.target.value);
        if (ms !== null) onChange(ms);
      }}
      onBlur={() => {
        if (text !== null) onChange(timeoutMsFromSeconds(text));
        setText(null);
      }}
      className="max-w-[12rem]"
    />
  );
}
