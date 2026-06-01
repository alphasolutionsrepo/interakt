import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the logger before importing the module under test
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  registerStepHandler,
  getStepHandler,
  requireStepHandler,
  getRegisteredStepTypes,
  clearStepHandlers,
} from './step-registry';
import type { StepHandler } from './pipeline.types';

function makeHandler(type: StepHandler['type']): StepHandler {
  return {
    type,
    execute: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe('step-registry', () => {
  beforeEach(() => {
    clearStepHandlers();
  });

  describe('registerStepHandler', () => {
    it('registers a handler and makes it retrievable', () => {
      const handler = makeHandler('intent_detection');
      registerStepHandler(handler);

      expect(getStepHandler('intent_detection')).toBe(handler);
    });

    it('silently skips duplicate registration (HMR-safe) and keeps the first handler', () => {
      const first = makeHandler('intent_detection');
      const second = makeHandler('intent_detection');
      registerStepHandler(first);
      registerStepHandler(second);

      // Duplicate registration is a no-op so dev HMR doesn't blow up; the
      // first handler stays in place rather than being clobbered.
      expect(getStepHandler('intent_detection')).toBe(first);
    });

    it('allows different types to be registered independently', () => {
      const a = makeHandler('intent_detection');
      const b = makeHandler('validation');

      registerStepHandler(a);
      registerStepHandler(b);

      expect(getStepHandler('intent_detection')).toBe(a);
      expect(getStepHandler('validation')).toBe(b);
    });
  });

  describe('getStepHandler', () => {
    it('returns undefined for unregistered type', () => {
      expect(getStepHandler('agentic_loop')).toBeUndefined();
    });
  });

  describe('requireStepHandler', () => {
    it('returns the handler when registered', () => {
      const handler = makeHandler('tool_execution');
      registerStepHandler(handler);

      expect(requireStepHandler('tool_execution')).toBe(handler);
    });

    it('throws with descriptive message when not registered', () => {
      expect(() => requireStepHandler('tool_execution')).toThrow(
        'No step handler registered for type "tool_execution"',
      );
    });
  });

  describe('getRegisteredStepTypes', () => {
    it('returns empty array when nothing registered', () => {
      expect(getRegisteredStepTypes()).toEqual([]);
    });

    it('returns all registered types', () => {
      registerStepHandler(makeHandler('intent_detection'));
      registerStepHandler(makeHandler('validation'));
      registerStepHandler(makeHandler('response_synthesis'));

      expect(getRegisteredStepTypes()).toEqual([
        'intent_detection',
        'validation',
        'response_synthesis',
      ]);
    });
  });

  describe('clearStepHandlers', () => {
    it('removes all registered handlers', () => {
      registerStepHandler(makeHandler('intent_detection'));
      registerStepHandler(makeHandler('validation'));

      clearStepHandlers();

      expect(getRegisteredStepTypes()).toEqual([]);
      expect(getStepHandler('intent_detection')).toBeUndefined();
    });
  });
});
