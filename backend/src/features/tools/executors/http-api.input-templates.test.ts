// src/features/tools/executors/http-api.input-templates.test.ts

/**
 * What the AI passes to an HTTP tool fills the URL's path and query, the query parameters,
 * the headers and the body. The host and the authentication stay as the admin set them, so a
 * request, and the secret it carries, always goes to the server the admin chose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeHttpApi } from './http-api';

const { resolveSecret } = vi.hoisted(() => ({ resolveSecret: vi.fn(async (name: string) => (name === 'orders_key' ? 'sk-orders' : null)) }));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret }));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ items: [] }), { status: 200 }));
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); resolveSecret.mockClear(); });

const tool = (overrides: Record<string, unknown>) => ({
  baseUrl: 'https://api.example.com/orders',
  method: 'GET',
  responseMapping: { resultsPath: '$.items' },
  authentication: { type: 'header', key: 'X-Api-Key', valueRef: 'orders_key' },
  ...overrides,
});
const sentTo = () => fetchMock.mock.lastCall?.[0];
const sentInit = () => fetchMock.mock.lastCall?.[1];

describe('a host the AI would choose', () => {
  it.each([
    ['the whole host', 'https://{{input.host}}/orders'],
    ['part of the host', 'https://api.example.com{{input.suffix}}/orders'],
    ['the whole URL', '{{input.url}}'],
    ['the port', 'https://api.example.com:{{input.port}}/orders'],
    ['the scheme', '{{input.scheme}}://api.example.com/orders'],
    ['the path right after the host, with no "/"', 'https://api.example.com{{input.path}}'],
    ['the login before "@"', 'https://{{input.user}}@api.example.com/orders'],
  ])('is refused when the URL takes %s from input, and nothing is sent', async (_case, baseUrl) => {
    const result = await executeHttpApi(tool({ baseUrl }), { host: 'elsewhere.test', suffix: '.elsewhere.test', url: 'https://elsewhere.test/x', port: '8443', scheme: 'http', path: '/v1/items', user: 'someone' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fixed host: write the host and a "\/" before any/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays out of reach through a path value', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/orders/{{input.id}}' }), { id: '@elsewhere.test/x?y=1#z' });
    expect(new URL(sentTo()!).host).toBe('api.example.com');
    expect(sentTo()).toBe('https://api.example.com/orders/%40elsewhere.test%2Fx%3Fy%3D1%23z');
  });
});

describe("a path the AI would leave", () => {
  it.each([
    ['..', 'https://api.example.com/orders/{{input.id}}/items', { id: '..' }],
    ['.', 'https://api.example.com/orders/{{input.id}}/items', { id: '.' }],
    ['.. made of two values', 'https://api.example.com/orders/{{input.a}}{{input.b}}/items', { a: '.', b: '.' }],
    ['.. next to one the admin wrote', 'https://api.example.com/v1/../orders/{{input.id}}/items', { id: '..' }],
  ])('is refused for a %s segment, and nothing is sent', async (_case, baseUrl, input) => {
    const result = await executeHttpApi(tool({ baseUrl }), input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/input value for the URL path is "\." or "\.\."/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps dots that are part of a value', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/files/{{input.name}}' }), { name: '..report.v2' });
    expect(sentTo()).toBe('https://api.example.com/files/..report.v2');
  });

  it('leaves an empty segment for a field the AI did not pass', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/orders/{{input.id}}' }), {});
    expect(sentTo()).toBe('https://api.example.com/orders/');
  });
});

describe('a URL the admin wrote', () => {
  it('is sent as written when it has no placeholders', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/v1/orders' }), { id: 'A-1' });
    expect(sentTo()).toBe('https://api.example.com/v1/orders');
  });

  it('keeps its own dot segments', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/v1/../v2/orders/{{input.id}}' }), { id: 'A-1' });
    expect(new URL(sentTo()!).pathname).toBe('/v2/orders/A-1');
  });

  it('keeps its own query when query parameters and a query key are added', async () => {
    await executeHttpApi(tool({
      baseUrl: 'https://api.example.com/search?q={{input.q}}',
      queryParams: { lang: '{{input.lang}}' },
      authentication: { type: 'query_param', key: 'api_key', valueRef: 'orders_key' },
    }), { q: 'linen', lang: 'da' });
    expect(Object.fromEntries(new URL(sentTo()!).searchParams)).toEqual({ q: 'linen', lang: 'da', api_key: 'sk-orders' });
  });

  it.each([
    ['ending in "?"', 'https://api.example.com/search?', 'https://api.example.com/search?lang=da'],
    ['ending in "&"', 'https://api.example.com/search?v=2&', 'https://api.example.com/search?v=2&lang=da'],
  ])('adds query parameters to a URL %s without an extra separator', async (_case, baseUrl, expected) => {
    await executeHttpApi(tool({ baseUrl, queryParams: { lang: 'da' }, authentication: undefined }), {});
    expect(sentTo()).toBe(expected);
  });

  it('takes input in its query, encoded', async () => {
    await executeHttpApi(tool({ baseUrl: 'https://api.example.com/search?q={{input.q}}' }), { q: 'red & blue' });
    expect(sentTo()).toBe('https://api.example.com/search?q=red%20%26%20blue');
  });
});

describe('the authentication', () => {
  it('uses the secret the admin named, whatever the input', async () => {
    await executeHttpApi(tool({ authentication: { type: 'header', key: 'X-Api-Key', valueRef: '{{input.secret}}' } }), { secret: 'orders_key' });
    expect(resolveSecret).toHaveBeenCalledWith('{{input.secret}}');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('input the admin placed', () => {
  it('fills the path, query parameters, headers and body, and the secret goes to the admin\'s server', async () => {
    await executeHttpApi(tool({
      baseUrl: 'https://api.example.com/orders/{{input.id}}',
      method: 'POST',
      queryParams: { lang: '{{input.lang}}' },
      headers: { 'X-Locale': '{{input.lang}}' },
      bodyTemplate: { note: 'order {{input.id}}' },
    }), { id: 'A-1', lang: 'da' });

    expect(sentTo()).toBe('https://api.example.com/orders/A-1?lang=da');
    const headers = sentInit()?.headers as Record<string, string>;
    expect(headers['X-Locale']).toBe('da');
    expect(headers['X-Api-Key']).toBe('sk-orders');
    expect(JSON.parse(sentInit()?.body as string)).toEqual({ note: 'order A-1' });
  });
});

describe('a URL that is not a full URL', () => {
  it.each(['orders', 'api.example.com/orders', 'http//api.example.com/orders'])('says %s is not a full URL, and nothing is sent', async (baseUrl) => {
    const result = await executeHttpApi(tool({ baseUrl }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a full URL.*starts with https:\/\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
