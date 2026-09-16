import { request } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';

// Exercise LAN routing over loopback without exposing a network listener.
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  networkInterfaces: () => ({ test: [{ internal: false, family: 'IPv4', address: '192.168.1.42' }] }),
}));
vi.mock('node:http', async (importOriginal) => {
  const http = await importOriginal<typeof import('node:http')>();
  return {
    ...http,
    createServer: (handler: Parameters<typeof http.createServer>[0]) => {
      const server = http.createServer(handler);
      const listen = server.listen.bind(server);
      server.listen = ((port: number, _host: string, callback: () => void) =>
        listen(port, '127.0.0.1', callback)) as typeof server.listen;
      return server;
    },
  };
});
import { startPhonePreview, type PhoneReport } from './workbench-phone.js';

function fetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode ?? 500,
            headers: res.headers as Record<string, string>,
          }),
        ),
      );
    });
    req.on('error', reject);
    req.end(init.body);
  });
}
let phone: Awaited<ReturnType<typeof startPhonePreview>> | undefined;
afterEach(async () => {
  await phone?.close();
  phone = undefined;
});
it('phone capability can read and report but cannot execute editor operations', async () => {
  const reports: PhoneReport[] = [];
  phone = await startPhonePreview({
    address: '192.168.1.42',
    snapshot: async () => ({ html: 'game', revision: 'one' }),
    status: async () => ({ revision: 'one' }),
    artifact: vi.fn(() => ({ id: 'evidence' })),
    reports,
  });
  const url = new URL(phone.url),
    local = `http://127.0.0.1:${url.port}`;
  const headers = {
    Host: url.host,
    Origin: url.origin,
    Authorization: `Bearer ${url.hash.slice(1)}`,
    'Content-Type': 'application/json',
  };
  const shell = await fetch(`${local}/`, { headers: { Host: url.host } });
  expect(shell.headers.get('content-security-policy')).toContain('img-src data: blob:');
  expect((await fetch(`${local}/game`, { headers: { Host: url.host } })).status).toBe(401);
  expect((await fetch(`${local}/game`, { headers: { ...headers, Origin: 'null' } })).status).toBe(403);
  expect((await fetch(`${local}/game`, { headers: { ...headers, Host: 'evil.example' } })).status).toBe(403);
  expect(await fetch(`${local}/game`, { headers }).then((r) => r.json())).toEqual({ html: 'game', revision: 'one' });
  expect((await fetch(`${local}/commands`, { method: 'POST', headers, body: '{}' })).status).toBe(404);
  const report = { id: '12345678-1234-4123-8123-123456789abc', text: 'Car stuck', revision: 'old-build' };
  for (let i = 0; i < 2; i++)
    expect((await fetch(`${local}/report`, { method: 'POST', headers, body: JSON.stringify(report) })).status).toBe(
      200,
    );
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ revision: 'old-build', text: 'Car stuck' });
  expect(
    (await fetch(`${local}/report`, { method: 'POST', headers, body: JSON.stringify({ ...report, text: 'changed' }) }))
      .status,
  ).toBe(409);
  await phone.close();
  await expect(fetch(`${local}/game`, { headers })).rejects.toThrow();
});
it('refuses public and unselected bind addresses', async () => {
  await expect(
    startPhonePreview({
      address: '0.0.0.0',
      snapshot: async () => null,
      status: async () => null,
      artifact: () => ({ id: '' }),
      reports: [],
    }),
  ).rejects.toThrow('private LAN');
});
