import { startPhonePreview } from './workbench-phone.js';
import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createSessionController } from './session-controller.js';
import { startSessionBrowser } from './session-browser-server.js';

vi.mock('./workbench-phone.js', async (original) => ({
  ...(await original<typeof import('./workbench-phone.js')>()),
  startPhonePreview: vi.fn(),
}));

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});
async function fixture() {
  const cancel = vi.fn();
  const session = createSessionController('hello', cancel);
  const server = await startSessionBrowser(session);
  cleanup.push(async () => {
    session.close();
    await server.close();
  });
  const url = new URL(server.url);
  const headers = {
    Authorization: `Bearer ${url.hash.slice(1)}`,
    Origin: url.origin,
    'Content-Type': 'application/json',
  };
  const state = await fetch(`${url.origin}/state`, { headers }).then((r) => r.json());
  const post = (command: unknown, sessionId = state.sessionId) =>
    fetch(`${url.origin}/commands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ version: 1, sessionId, command }),
    });
  return { session, server, url, headers, post, cancel };
}

it('authenticates state and commands; rejects game, foreign origins and DNS rebinding', async () => {
  const { url, headers } = await fixture();
  expect((await fetch(`${url.origin}/state`)).status).toBe(401);
  for (const Origin of ['null', 'https://evil.example']) {
    expect((await fetch(`${url.origin}/state`, { headers: { ...headers, Origin } })).status).toBe(403);
  }
  const status = await new Promise<number | undefined>((resolve) => {
    const req = request(`${url.origin}/state`, { headers: { ...headers, Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.end();
  });
  expect(status).toBe(403);
  const shell = await fetch(url.origin);
  expect(shell.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  const html = await shell.text();
  expect(html).toContain('sandbox="allow-scripts allow-pointer-lock"');
  expect(html).not.toContain(url.hash.slice(1));
  expect(
    (await fetch(`${url.origin}/commands`, { method: 'POST', headers: { Authorization: headers.Authorization } }))
      .status,
  ).toBe(403);
});

it('shares receipts, questions and Stop across clients without exposing terminal drafts', async () => {
  const { session, url, headers, post, cancel } = await fixture();
  const first = session.prompt();
  session.setDraft('private unfinished draft');
  const snapshot = await fetch(`${url.origin}/state`, { headers }).then((r) => r.json());
  expect(snapshot).not.toHaveProperty('draft');
  const command = { id: 'browser-1', kind: 'input', promptId: snapshot.promptId, text: 'Add ramps' };
  expect(await post(command).then((r) => r.json())).toMatchObject({ status: 'accepted' });
  expect(await post(command).then((r) => r.json())).toMatchObject({ status: 'accepted' });
  for (const changed of [
    { ...command, text: '' },
    { ...command, text: 'x'.repeat(8001) },
    { ...command, promptId: -1 },
  ]) {
    expect(await post(changed).then((r) => r.json())).toMatchObject({ status: 'conflict' });
    expect(await post({ ...changed, id: 'unused' }).then((r) => r.json())).toMatchObject({ status: 'invalid' });
  }
  expect(await first).toBe('Add ramps');
  session.setLocalTask('codex');
  const taskId = session.get().taskId;
  expect(await post({ id: 'queue', kind: 'queue', taskId, text: 'More lights' }).then((r) => r.json())).toMatchObject({
    status: 'accepted',
  });
  const choice = session.prompt(['Keep', 'Send'], 'Deliver?');
  expect(await post({ ...command, id: 'old' }).then((r) => r.json())).toMatchObject({ status: 'stale' });
  expect(
    await post({ id: 'choice', kind: 'input', promptId: session.get().promptId, text: 'Keep' }).then((r) => r.json()),
  ).toMatchObject({ status: 'accepted' });
  expect(await choice).toBe('Keep');
  const stop = { id: 'stop', kind: 'stop', taskId };
  await post(stop);
  await post(stop);
  expect(cancel).toHaveBeenCalledOnce();
  expect(session.get().queued).toEqual([]);
});

it('validates the envelope and bounds requests before dispatch', async () => {
  const { session, post, url, headers } = await fixture();
  const prompt = session.prompt();
  const command = { id: 'one', kind: 'input', promptId: session.get().promptId, text: 'Hello' };
  expect((await post(command, '11111111-1111-4111-8111-111111111111')).status).toBe(409);
  for (const invalid of [
    { ...command, shell: 'rm' },
    { ...command, kind: 'exec' },
    { ...command, promptId: '1' },
    { ...command, text: [] },
  ]) {
    expect((await post(invalid)).status).toBe(400);
  }
  expect((await fetch(`${url.origin}/commands`, { method: 'POST', headers, body: ' '.repeat(50_000) })).status).toBe(
    400,
  );
  expect(await post({ ...command, text: '/push' }).then((r) => r.json())).toMatchObject({ status: 'invalid' });
  session.close();
  await prompt;
});

it('serves only explicitly bound preview snapshots and fences a switched source', async () => {
  const { server, url, headers } = await fixture();
  const html = '<html><body>test game</body></html>';
  const revision = createHash('sha256').update(html).digest('hex');
  const game = createServer((req, res) => {
    if (req.url?.endsWith('/status')) res.end(JSON.stringify({ revision, busy: false, stale: false, error: '' }));
    else res.end(html);
  });
  await new Promise<void>((resolve) => game.listen(0, '127.0.0.1', resolve));
  cleanup.push(async () => {
    game.closeAllConnections();
    await new Promise<void>((resolve) => game.close(() => resolve()));
  });
  const address = game.address() as { port: number };
  expect(() => server.setPreview('https://evil.example/')).toThrow();
  server.setPreview(`http://127.0.0.1:${address.port}/${'a'.repeat(48)}/`);
  const built = await fetch(`${url.origin}/preview/game`, { headers }).then((r) => r.json());
  expect(built).toMatchObject({ revision, sourceId: 1 });
  expect(built.html).toContain('test game');
  expect(built.html).toContain('gdpl-embed');
  expect(built.html).toContain('gdpl-workbench-game');
  server.clearPreview();
  expect((await fetch(`${url.origin}/preview/game`, { headers })).status).toBe(404);
  expect(await fetch(`${url.origin}/state`, { headers }).then((r) => r.json())).toMatchObject({
    hasPreview: false,
    sourceId: 2,
  });
});

it('answers a phone pairing race with 409 and closes the superseded listener', async () => {
  const { server, url, headers } = await fixture();
  server.setPreview(`http://127.0.0.1:54321/${'a'.repeat(48)}/`);
  let finish!: (value: Awaited<ReturnType<typeof startPhonePreview>>) => void;
  const close = vi.fn(async () => {});
  vi.mocked(startPhonePreview).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const response = fetch(`${url.origin}/phone`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ address: '192.168.1.42' }),
    signal: AbortSignal.timeout(2000),
  });
  await vi.waitFor(() => expect(finish).toBeDefined());
  server.clearPreview();
  finish({ url: 'http://fixture.test/', expiresAt: '', qr: '', close });
  const result = await response;
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({ error: 'Paired game changed' });
  expect(close).toHaveBeenCalledOnce();
  expect(await fetch(`${url.origin}/state`, { headers }).then((r) => r.json())).not.toHaveProperty('phone');
});
