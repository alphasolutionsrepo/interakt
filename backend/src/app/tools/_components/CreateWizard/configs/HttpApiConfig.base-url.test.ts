// src/app/tools/_components/CreateWizard/configs/HttpApiConfig.base-url.test.ts

/**
 * The HTTP tool form says, as the admin types, when the base URL lets input choose the host,
 * with what to change; a URL with input after the host and its "/" gets no warning.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HttpApiConfig } from './HttpApiConfig';

const WARNING = 'write the host and a &quot;/&quot; before any {{input.field}}';
const render = (baseUrl: string, errors?: Record<string, string>) =>
  renderToStaticMarkup(createElement(HttpApiConfig, { value: { baseUrl, method: 'GET' }, onChange: vi.fn(), errors }));

describe('the base URL field', () => {
  it.each([
    ['takes the host from input', 'https://{{input.host}}/orders'],
    ['puts input right after the host', 'https://api.example.com{{input.path}}'],
  ])('warns when the URL %s', (_case, baseUrl) => {
    expect(render(baseUrl)).toContain(WARNING);
  });

  it('has no warning for input after the host and its "/"', () => {
    expect(render('https://api.example.com/orders/{{input.id}}')).not.toContain(WARNING);
  });

  it('has no warning while the field is empty', () => {
    expect(render('')).not.toContain(WARNING);
  });

  it('shows a save error instead of the warning, once', () => {
    const html = render('https://{{input.host}}/orders', { baseUrl: 'Base URL is required' });
    expect(html).toContain('Base URL is required');
    expect(html).not.toContain(WARNING);
  });
});
