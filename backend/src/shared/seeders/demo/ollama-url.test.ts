// src/shared/seeders/demo/ollama-url.test.ts

import { describe, expect, it } from 'vitest';

import { sameOllamaUrl, trustedOllamaUrl } from './ollama-url';

const configured = ['http://gpu-box.lan:11434/', undefined, 'http://localhost:11434'];

describe('trustedOllamaUrl', () => {
  it('checks a configured Ollama URL, as configured', () => {
    expect(trustedOllamaUrl('http://gpu-box.lan:11434', configured)).toBe('http://gpu-box.lan:11434/');
  });

  it('checks Ollama on this machine or the Docker host, on any port', () => {
    expect(trustedOllamaUrl('http://localhost:11500/', configured)).toBe('http://localhost:11500');
    expect(trustedOllamaUrl('http://host.docker.internal:11434', configured)).toBe('http://host.docker.internal:11434');
    expect(trustedOllamaUrl('http://127.0.0.1', configured)).toBe('http://127.0.0.1');
  });

  it.each([
    ['another host', 'http://169.254.169.254/latest/meta-data'],
    ['a host that only starts like a local one', 'http://localhost.evil.example:11434'],
    ['credentials in the URL', 'http://user:pass@localhost:11434'],
    ['another scheme', 'file:///etc/passwd'],
    ['text that is not a URL', 'localhost:11434'],
  ])('refuses %s', (_case, typed) => {
    expect(trustedOllamaUrl(typed, configured)).toBeUndefined();
  });
});

describe('sameOllamaUrl', () => {
  it('treats the configured spelling of the URL the admin typed as the same server', () => {
    expect(sameOllamaUrl('http://gpu-box.lan:11434', 'http://gpu-box.lan:11434/')).toBe(true);
    expect(sameOllamaUrl('http://GPU-Box.lan:11434/api', 'http://gpu-box.lan:11434')).toBe(true);
  });

  it('tells another server apart, and text that is not a URL', () => {
    expect(sameOllamaUrl('http://gpu-box.lan:11434', 'http://localhost:11434')).toBe(false);
    expect(sameOllamaUrl('http://localhost:11434', 'http://localhost:11500')).toBe(false);
    expect(sameOllamaUrl('localhost', 'http://localhost')).toBe(false);
  });
});
