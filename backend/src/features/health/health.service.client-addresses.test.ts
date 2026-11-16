// src/features/health/health.service.client-addresses.test.ts

/**
 * The client-address health check, through the real clientIp: what requests showed, and the
 * setting, decide whether admins are told the setup needs attention.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { checkClientAddressHealth } from './health.service';

import { clientIp, clientAddressSetup, resetClientAddressSetup } from '@/shared/api/client-ip';

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetClientAddressSetup();
});

describe('checkClientAddressHealth', () => {
  it('is healthy before any request needed an address, and while requests match the setting', async () => {
    expect((await checkClientAddressHealth()).status).toBe('healthy');
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    const health = await checkClientAddressHealth();
    expect(health).toMatchObject({ name: 'Client addresses', status: 'healthy', details: { setting: 'forwarded-for:1', requestsWithAddress: 1, requestsWithoutAddress: 0 } });
    expect(health.task).toBeUndefined();
  });

  it('asks for attention, with counts, when a request arrives with no X-Forwarded-For at all', async () => {
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    clientIp(request({}));
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.task).toBe('Check how client addresses are read');
    expect(health.message).toMatch(/fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front \(1\)/);
    expect(health.message).toMatch(/share one rate-limit count at 10×/);
    expect(health.details).toMatchObject({ requestsWithAddress: 1, requestsWithoutAddress: 1 });
  });

  it('asks for attention when there are fewer entries than proxies', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for:2');
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.message).toMatch(/fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front \(2\)/);
  });

  it('asks for attention when the header set to hold the address holds something else', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Azure-SocketIP');
    clientIp(request({ 'X-Azure-SocketIP': 'not-an-ip' }));
    expect(clientAddressSetup().problem).toBe('not-an-address');
    expect((await checkClientAddressHealth()).message).toMatch(/header:X-Azure-SocketIP.*isn't an IP address/);
  });

  it('asks for attention with CLIENT_IP_SOURCE=none, as not recommended for production', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'none');
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.message).toMatch(/Not recommended for production/);
  });

  it('asks for attention when the setting is not valid, without showing it', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'secret-looking-value');
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.message).toMatch(/isn't a value Interakt understands/);
    expect(JSON.stringify(health)).not.toContain('secret-looking-value');
  });

  it('stops asking a day after requests last showed the problem', async () => {
    vi.useFakeTimers();
    clientIp(request({}));
    expect((await checkClientAddressHealth()).status).toBe('degraded');
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect((await checkClientAddressHealth()).status).toBe('healthy');
  });
});
