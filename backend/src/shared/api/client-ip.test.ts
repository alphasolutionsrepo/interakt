// src/shared/api/client-ip.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { clientIp } from './client-ip';

function request(headers: Record<string, string> | Headers) {
  return { headers: headers instanceof Headers ? headers : new Headers(headers) };
}

describe('clientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockReset();
  });

  it('takes the address the proxy added, not the ones the client wrote before it', () => {
    expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 2.2.2.2, 9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(request({ 'X-Forwarded-For': ' 1.1.1.1 ,, 9.9.9.9 ' }))).toBe('9.9.9.9');
  });

  it('reads all X-Forwarded-For headers of a request as one list', () => {
    const headers = new Headers();
    headers.append('X-Forwarded-For', '1.1.1.1');
    headers.append('X-Forwarded-For', '9.9.9.9');
    expect(clientIp(request(headers))).toBe('9.9.9.9');
  });

  it('counts back TRUSTED_PROXY_HOPS entries when there are more proxies in front', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    // fewer entries than proxies: the first one
    expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('uses one proxy, and warns once, when TRUSTED_PROXY_HOPS is not a whole number from 1', () => {
    for (const setting of ['0', '-1', '1.5', 'two']) {
      vi.stubEnv('TRUSTED_PROXY_HOPS', setting);
      expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' }))).toBe('9.9.9.9');
      clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    }
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('falls back to X-Real-IP, then to "unknown"', () => {
    expect(clientIp(request({ 'X-Real-IP': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(request({ 'X-Forwarded-For': ' ', 'X-Real-IP': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(request({}))).toBe('unknown');
  });
});
