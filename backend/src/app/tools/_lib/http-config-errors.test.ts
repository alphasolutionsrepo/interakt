// src/app/tools/_lib/http-config-errors.test.ts

/**
 * The create wizard leaves the HTTP settings step only when this gives no errors, and shows
 * each error under its field.
 */

import { describe, expect, it } from 'vitest';

import { baseUrlProblem, httpConfigErrors } from './http-config-errors';

const withResults = (baseUrl: unknown) => ({ baseUrl, responseMapping: { resultsPath: '$.items' } });

describe('httpConfigErrors', () => {
  it.each([
    'https://api.example.com/orders',
    '  https://api.example.com/orders  ',
    'https://api.example.com/orders/{{input.id}}',
    '{{secret:base}}/orders',
  ])('gives no errors for %s, so the step can pass', (baseUrl) => {
    // The step counts keys, so a key holding undefined would still block it
    expect(Object.keys(httpConfigErrors(withResults(baseUrl)))).toEqual([]);
  });

  it('asks for a base URL and a results path when both are empty', () => {
    expect(httpConfigErrors({})).toEqual({
      baseUrl: 'Base URL is required',
      'responseMapping.resultsPath': 'Results path is required',
    });
  });

  it('asks for a base URL when it is only spaces', () => {
    expect(httpConfigErrors(withResults('   ')).baseUrl).toBe('Base URL is required');
  });

  it.each(['orders', 'api.example.com/orders', 'localhost:8080/api'])('says %s is not a full URL', (baseUrl) => {
    expect(httpConfigErrors(withResults(baseUrl)).baseUrl).toMatch(/not a full URL.*starts with https:\/\//);
  });

  it('says to keep the host fixed when input chooses it', () => {
    expect(httpConfigErrors(withResults('https://{{input.host}}/orders')).baseUrl).toMatch(/fixed host/);
  });
});

describe('baseUrlProblem, shown as the admin types', () => {
  it.each([undefined, '', '   ', 'https://api.example.com/orders'])('shows nothing for %j', (baseUrl) => {
    expect(baseUrlProblem(baseUrl)).toBeUndefined();
  });

  it('shows the same message the wizard step gives', () => {
    expect(baseUrlProblem('orders')).toBe(httpConfigErrors(withResults('orders')).baseUrl);
  });
});
