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

  it('asks for attention, with counts, when requests keep arriving with no X-Forwarded-For at all', async () => {
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    for (let i = 0; i < 5; i++) clientIp(request({}));
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.task).toBe('Check how client addresses are read');
    expect(health.message).toMatch(/In the last hour, 5 requests had no client address Interakt can trust/);
    expect(health.message).toMatch(/fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front \(1\)/);
    expect(health.message).toMatch(/share one rate-limit count at 10×/);
    expect(health.details).toMatchObject({ requestsWithAddress: 1, requestsWithoutAddress: 5 });
  });

  it('asks for attention when there are fewer entries than proxies', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'forwarded-for:2');
    for (let i = 0; i < 5; i++) clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('degraded');
    expect(health.message).toMatch(/fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front \(2\)/);
  });

  it('asks for attention when the header set to hold the address holds something else', async () => {
    vi.stubEnv('CLIENT_IP_SOURCE', 'header:X-Azure-SocketIP');
    for (let i = 0; i < 5; i++) clientIp(request({ 'X-Azure-SocketIP': 'not-an-ip' }));
    expect(clientAddressSetup().problem).toBe('not-an-address');
    expect((await checkClientAddressHealth()).message).toMatch(/header:X-Azure-SocketIP.*isn't an IP address/);
  });

  it("stays healthy for a few stray requests without a trusted address (fewer than 5, or under a tenth of the traffic)", async () => {
    for (let i = 0; i < 4; i++) clientIp(request({}));
    expect((await checkClientAddressHealth()).status).toBe('healthy');
    for (let i = 0; i < 100; i++) clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    for (let i = 0; i < 6; i++) clientIp(request({}));
    // 10 of 110 is under a tenth
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('healthy');
    expect(health.details).toMatchObject({ requestsWithAddress: 100, requestsWithoutAddress: 10 });
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

  it('stops asking once an hour has passed without the problem (a fixed setup clears itself)', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) clientIp(request({}));
    expect((await checkClientAddressHealth()).status).toBe('degraded');
    vi.advanceTimersByTime(30 * 60_000);
    clientIp(request({ 'X-Forwarded-For': '9.9.9.9' }));
    expect((await checkClientAddressHealth()).status).toBe('degraded');
    vi.advanceTimersByTime(40 * 60_000);
    const health = await checkClientAddressHealth();
    expect(health.status).toBe('healthy');
    expect(health.details).toMatchObject({ requestsWithAddress: 1, requestsWithoutAddress: 0 });
  });

  it('is seen by another copy of the module, as the scheduled health job bundled apart from the routes has', async () => {
    for (let i = 0; i < 5; i++) clientIp(request({}));
    vi.resetModules();
    const copy = await import('./health.service');
    expect((await copy.checkClientAddressHealth()).status).toBe('degraded');
  });
});
