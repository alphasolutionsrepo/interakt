// src/shared/api/client-ip.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { clientIp, resetClientIpWarnings } from './client-ip';

function request(headers: Record<string, string> | Headers) {
  return { headers: headers instanceof Headers ? headers : new Headers(headers) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockReset();
  resetClientIpWarnings();
});

describe('clientIp with the default source (one proxy, as on most hosting platforms)', () => {
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

  it('has no address when the header is missing, and does not trust X-Real-IP, which a client can send', () => {
    expect(clientIp(request({}))).toBeNull();
    expect(clientIp(request({ 'X-Real-IP': '8.8.8.8' }))).toBeNull();
    expect(clientIp(request({ 'X-Forwarded-For': ' ', 'X-Real-IP': '8.8.8.8' }))).toBeNull();
  });

  it('has no address when the trusted entry is not an IP address', () => {
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, not-an-address' }))).toBeNull();
    expect(clientIp(request({ 'X-Forwarded-For': 'x'.repeat(8_000) }))).toBeNull();
  });

  it('reads IPv6 addresses', () => {
    expect(clientIp(request({ 'X-Forwarded-For': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('drops the port some platforms add to the address (ip:port, [ipv6]:port)', () => {
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9:54321' }))).toBe('9.9.9.9');
    expect(clientIp(request({ 'X-Forwarded-For': '[2001:db8::1]:443' }))).toBe('2001:db8::1');
    expect(clientIp(request({ 'X-Forwarded-For': '[2001:db8::1]' }))).toBe('2001:db8::1');
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Client-IP');
    expect(clientIp(request({ 'X-Client-IP': '9.9.9.9:1234' }))).toBe('9.9.9.9');
    // Not an address with a port
    expect(clientIp(request({ 'X-Client-IP': '9.9.9.9:port' }))).toBeNull();
    expect(clientIp(request({ 'X-Client-IP': '[not-an-ip]:1' }))).toBeNull();
  });

  it('warns once that no proxy seems to be in front when requests arrive without X-Forwarded-For', () => {
    clientIp(request({}));
    clientIp(request({}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/CLIENT_IP_SOURCE/);
  });
});

describe('clientIp with TRUSTED_PROXY_HOPS (the earlier setting, still honoured)', () => {
  it('counts back that many entries when there are more proxies in front', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
  });

  it('has no address when there are fewer entries than proxies (a proxy was skipped)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }))).toBeNull();
  });

  it('uses one proxy, and warns once, when it is not a whole number from 1', () => {
    for (const setting of ['0', '-1', '1.5', 'two']) {
      vi.stubEnv('TRUSTED_PROXY_HOPS', setting);
      expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' }))).toBe('9.9.9.9');
      clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('two'); // the setting's value isn't logged
  });
});

describe('clientIp with CLIENT_IP_SOURCE', () => {
  it('forwarded-for:N counts back N entries, and wins over TRUSTED_PROXY_HOPS', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for:2');
    expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for');
    expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6, 9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('none trusts no header: there is never an address, and nothing is warned about', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'none');
    expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9', 'X-Real-IP': '8.8.8.8' }))).toBeNull();
    expect(clientIp(request({}))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('header:<name> reads one address from the header an edge sets', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Azure-SocketIP');
    expect(clientIp(request({ 'X-Azure-SocketIP': '9.9.9.9', 'X-Forwarded-For': '6.6.6.6' }))).toBe('9.9.9.9');
    expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6' }))).toBeNull();
    expect(clientIp(request({ 'X-Azure-SocketIP': '9.9.9.9, 6.6.6.6' }))).toBeNull();
  });

  it('is case- and space-tolerant', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', ' Header:cf-connecting-ip ');
    expect(clientIp(request({ 'CF-Connecting-IP': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('trusts nothing, and warns once without the value, when the setting is not understood', () => {
    for (const setting of ['forwarded-for:0', 'forwarded-for:x', 'header:', 'proxy', 'header:bad name']) {
      vi.stubEnv('CLIENT_IP_SOURCE', setting);
      expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }))).toBeNull();
      clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    }
    expect(warn).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('bad name');
  });
});
