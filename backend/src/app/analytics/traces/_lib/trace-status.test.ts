// src/app/analytics/traces/_lib/trace-status.test.ts

import { describe, expect, it } from 'vitest';

import { traceStatus } from './trace-status';

describe('traceStatus', () => {
  it('shows a summary the visitor left as cancelled, not failed', () => {
    expect(traceStatus({ statusCode: 'OK', cancelled: true })).toBe('cancelled');
    expect(traceStatus({ statusCode: 'UNSET', cancelled: true })).toBe('cancelled');
  });

  it('shows a failure as an error', () => {
    expect(traceStatus({ statusCode: 'ERROR', cancelled: false })).toBe('error');
  });

  it('shows anything else as completed', () => {
    expect(traceStatus({ statusCode: 'OK', cancelled: false })).toBe('ok');
    expect(traceStatus({ statusCode: 'UNSET', cancelled: false })).toBe('ok');
  });
});
