// src/shared/api/client-ip.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { clientIp, clientKey, limitFor, resetClientIpWarnings, clientAddressSetup, resetClientAddressSetup } from './client-ip';

function request(headers: Record<string, string> | Headers) {
  return { headers: headers instanceof Headers ? headers : new Headers(headers) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockReset();
  resetClientIpWarnings();
  resetClientAddressSetup();
  vi.useRealTimers();
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

  it('has no address, and warns once, when a request arrives without X-Forwarded-For (fewer entries than proxies)', () => {
    expect(clientIp(request({}))).toBeNull();
    clientIp(request({}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/fewer X-Forwarded-For entries/);
  });
});

describe('clientIp with TRUSTED_PROXY_HOPS (the earlier setting, still honoured)', () => {
  it('counts back that many entries when there are more proxies in front', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
  });

  it('has no address, and warns once, when there are fewer entries than proxies (a proxy was skipped)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }))).toBeNull();
    expect(clientIp(request({ 'X-Forwarded-For': '8.8.8.8' }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/fewer X-Forwarded-For entries/);
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

  it('warns once each, without the header value, for a missing header and for a value that is not an address', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Azure-SocketIP');
    clientIp(request({}));
    clientIp(request({}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/without the header named in CLIENT_IP_SOURCE/);
    clientIp(request({ 'X-Azure-SocketIP': 'secret-not-ip' }));
    clientIp(request({ 'X-Azure-SocketIP': 'secret-not-ip' }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/not an IP address/);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-not-ip');
  });

  it('warns once when the X-Forwarded-For entry is not an address', () => {
    clientIp(request({ 'X-Forwarded-For': 'secret-not-ip' }));
    clientIp(request({ 'X-Forwarded-For': 'secret-not-ip' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-not-ip');
  });

  it('none counts every request as one without a trusted address', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'none');
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    clientIp(request({}));
    expect(clientAddressSetup()).toMatchObject({ problem: 'none', trustedRequests: 0, untrustedRequests: 2 });
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

  it('uses the default (forwarded-for with TRUSTED_PROXY_HOPS), and warns once without the value, when the setting is not understood', () => {
    for (const setting of ['forwarded-for:0', 'forwarded-for:x', 'forwarded_for:1', 'header:', 'proxy', 'header:bad name']) {
      vi.stubEnv('CLIENT_IP_SOURCE', setting);
      expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6, 9.9.9.9' }))).toBe('9.9.9.9');
      clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
      expect(clientAddressSetup()).toMatchObject({ source: 'forwarded-for:1', hops: 1, problem: 'invalid-setting' });
    }
    expect(warn).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('bad name');
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    vi.stubEnv('CLIENT_IP_SOURCE', 'foo');
    expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientAddressSetup()).toMatchObject({ source: 'forwarded-for:2', hops: 2, problem: 'invalid-setting' });
  });

  it('forwarded-for without a number uses TRUSTED_PROXY_HOPS', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for');
    expect(clientIp(request({ 'X-Forwarded-For': '6.6.6.6, 9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientAddressSetup()).toMatchObject({ source: 'forwarded-for:2', hops: 2, problem: null });
  });

  it('records a missing header apart from one that holds something else', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Azure-SocketIP');
    for (let i = 0; i < 5; i++) clientIp(request({ 'X-Forwarded-For': '6.6.6.6' }));
    expect(clientAddressSetup().problem).toBe('missing-header');
    resetClientAddressSetup();
    for (let i = 0; i < 5; i++) clientIp(request({ 'X-Azure-SocketIP': 'nope' }));
    expect(clientAddressSetup().problem).toBe('not-an-address');
  });
});

describe('the setup status when TRUSTED_PROXY_HOPS is not valid', () => {
  it('reports an invalid setting, using one proxy, for each way the default is read', () => {
    for (const hops of ['0', '-1', '1.5', 'two']) {
      for (const source of [undefined, 'forwarded-for', 'forwarded-for:']) {
        vi.stubEnv('TRUSTED_PROXY_HOPS', hops);
        if (source !== undefined) vi.stubEnv('CLIENT_IP_SOURCE', source);
        expect(clientAddressSetup(), `${hops} / ${source}`).toMatchObject({ source: 'forwarded-for:1', hops: 1, problem: 'invalid-setting', invalid: 'hops' });
        vi.unstubAllEnvs();
      }
    }
  });

  it('reports an invalid setting when CLIENT_IP_SOURCE is not understood and TRUSTED_PROXY_HOPS is not valid either, naming the source', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', 'two');
    vi.stubEnv('CLIENT_IP_SOURCE', 'nonsense');
    expect(clientAddressSetup()).toMatchObject({ problem: 'invalid-setting', invalid: 'source' });
  });

  it('reports no problem when CLIENT_IP_SOURCE gives the proxies itself, or is header or none (TRUSTED_PROXY_HOPS is not used)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', 'two');
    for (const [source, problem] of [['forwarded-for:2', null], ['header:X-Real-IP', null], ['none', 'none']] as const) {
      vi.stubEnv('CLIENT_IP_SOURCE', source);
      const setup = clientAddressSetup();
      expect(setup.problem, source).toBe(problem);
      expect(setup.invalid).toBeUndefined();
    }
  });

  it('reports no problem for a valid TRUSTED_PROXY_HOPS', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientAddressSetup()).toMatchObject({ source: 'forwarded-for:2', problem: null });
  });
});

describe('the setup window', () => {
  it('never counts a request for more than 60 minutes, and always for at least 59', () => {
    vi.useFakeTimers();
    // Last second of a minute (counted the shortest time) and first second (the longest)
    vi.setSystemTime(new Date('2026-01-01T10:04:59Z'));
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    vi.setSystemTime(new Date('2026-01-01T10:05:00Z'));
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    vi.setSystemTime(new Date('2026-01-01T11:03:59Z'));
    expect(clientAddressSetup().trustedRequests).toBe(2);
    vi.setSystemTime(new Date('2026-01-01T11:04:00Z'));
    expect(clientAddressSetup().trustedRequests).toBe(1);
    vi.setSystemTime(new Date('2026-01-01T11:05:00Z'));
    expect(clientAddressSetup().trustedRequests).toBe(0);
  });

  it('covers the full hour: a request counts until an hour has passed, not 5 minutes sooner', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:04:00Z'));
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    vi.setSystemTime(new Date('2026-01-01T11:03:00Z'));
    expect(clientAddressSetup().trustedRequests).toBe(1);
    vi.setSystemTime(new Date('2026-01-01T11:05:00Z'));
    expect(clientAddressSetup().trustedRequests).toBe(0);
  });
});

describe('the requests kept for the setup status', () => {
  const kept = () => (globalThis as unknown as Record<symbol, { buckets: unknown[] }>)[Symbol.for('interakt.client-address-setup')].buckets.length;

  it('keeps about an hour of minutes however long the server runs, and counts only the last hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
    for (let minute = 0; minute < 3 * 60; minute++) {
      clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
      vi.advanceTimersByTime(60_000);
    }
    expect(kept()).toBeLessThanOrEqual(60);
    expect(clientAddressSetup().trustedRequests).toBe(59);
  });
});

describe('clientKey (what per-client rate limits count by)', () => {
  it('is the trusted address, held to the per-client limit', () => {
    const key = clientKey(request({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' }));
    expect(key).toEqual({ key: '9.9.9.9', shared: false });
    expect(limitFor(key, 5)).toBe(5);
  });

  it('is one shared key at ten times the limit for every request without a trusted address', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for:2');
    const missing = clientKey(request({}));
    const short = clientKey(request({ 'X-Forwarded-For': '9.9.9.9' }));
    const notAnAddress = clientKey(request({ 'X-Forwarded-For': 'evil, proxy' }));
    expect(missing).toEqual({ key: 'no-trusted-address', shared: true });
    expect(short).toEqual(missing);
    expect(notAnAddress).toEqual(missing);
    expect(limitFor(missing, 5)).toBe(50);
  });

  it('is shared with CLIENT_IP_SOURCE=none, whatever the client sends', () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'none');
    expect(clientKey(request({ 'X-Forwarded-For': '9.9.9.9' }))).toEqual({ key: 'no-trusted-address', shared: true });
  });
});

describe('one form per address', () => {
  const ip = (xff: string) => clientIp(request({ 'X-Forwarded-For': xff }));

  it('reads an IPv4-mapped IPv6 address as the IPv4 address, bracketed with a port too', () => {
    expect(ip('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(ip('::FFFF:102:304')).toBe('1.2.3.4');
    expect(ip('[::ffff:1.2.3.4]:443')).toBe('1.2.3.4');
  });

  it('keeps IPv4-compatible forms (deprecated) as IPv6, so ::1:2 is not read as 0.1.0.2', () => {
    expect(ip('::1.2.3.4')).toBe('::102:304');
    expect(ip('::1:2')).toBe('::1:2');
    expect(ip('::1')).toBe('::1');
    expect(ip('::')).toBe('::');
  });

  it('writes IPv6 lowercase in one compressed form', () => {
    expect(ip('2001:DB8::1')).toBe('2001:db8::1');
    expect(ip('2001:db8:0:0::1')).toBe('2001:db8::1');
    expect(ip('2001:db8::0001')).toBe('2001:db8::1');
    expect(ip('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(ip('[2001:DB8:0:0::1]:8080')).toBe('2001:db8::1');
  });

  it('compresses only the longest run of zeros, and not a single group', () => {
    expect(ip('2001:db8:0:1:0:0:0:1')).toBe('2001:db8:0:1::1');
    expect(ip('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
  });

  it('drops a zone id', () => {
    expect(ip('fe80::1%eth0')).toBe('fe80::1');
  });
});

describe('clientKey groups IPv6 by prefix', () => {
  const key = (xff: string) => clientKey(request({ 'X-Forwarded-For': xff }));

  it('counts addresses in one /56 together', () => {
    const first = key('2001:db8:1:200::1');
    expect(first).toEqual({ key: '2001:db8:1:200::/56', shared: false });
    expect(key('2001:db8:1:2ff:ffff:ffff:ffff:ffff').key).toBe(first.key);
    expect(key('2001:DB8:1:02ab::5').key).toBe(first.key);
  });

  it('counts a different /56 apart', () => {
    expect(key('2001:db8:1:300::1').key).not.toBe(key('2001:db8:1:200::1').key);
  });

  it('counts IPv4-compatible forms as IPv6, per /56', () => {
    expect(key('::1:2')).toEqual({ key: '::/56', shared: false });
    expect(key('::1.2.3.4')).toEqual({ key: '::/56', shared: false });
  });

  it('counts a mapped address as the IPv4 address, IPv4 unchanged', () => {
    expect(key('::ffff:1.2.3.4')).toEqual({ key: '1.2.3.4', shared: false });
    expect(key('1.2.3.4').key).toBe('1.2.3.4');
  });
});
