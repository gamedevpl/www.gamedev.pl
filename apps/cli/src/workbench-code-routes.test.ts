import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionController } from './session-controller.js';
import { startSessionBrowser } from './session-browser-server.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'play-code-http-'));
  mkdirSync(join(root, 'games/demo'), { recursive: true });
  writeFileSync(join(root, 'games/demo/game.ts'), 'export const score = 1;');
  let checkout: { root: string; slug: string } | null = { root, slug: 'demo' };
  const session = createSessionController('hello');
  const server = await startSessionBrowser(session, {
    code: { checkout: () => checkout, env: { OPENAI_API_KEY: 'mock-not-used' } },
  });
  cleanup.push(async () => {
    session.close();
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });
  const url = new URL(server.url);
  const headers = {
    Authorization: `Bearer ${url.hash.slice(1)}`,
    Origin: url.origin,
    'Content-Type': 'application/json',
  };
  const get = (path: string, extra = {}) => fetch(url.origin + path, { headers: { ...headers, ...extra } });
  const post = (path: string, body: unknown, extra = {}) =>
    fetch(url.origin + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  const project = await get('/code/project').then((response) => response.json());
  const file = await post('/code/file', { projectId: project.projectId, path: project.files[0].path }).then(
    (response) => response.json(),
  );
  return {
    root,
    get,
    post,
    project,
    file: file.file,
    switchProject: () => {
      checkout = null;
    },
  };
}
it('authenticates editor, worker and writes; prevents foreign origin and stale content saves', async () => {
  const f = await fixture();
  for (const path of ['/code/project', '/code/worker']) {
    expect((await f.get(path, { Authorization: '' })).status).toBe(401);
    expect((await f.get(path, { Origin: 'null' })).status).toBe(403);
  }
  const request = {
    projectId: f.project.projectId,
    path: f.project.files[0].path,
    version: f.file.version,
    content: 'export const score = 2;',
  };
  expect((await f.post('/code/save', request, { Origin: 'https://evil.test' })).status).toBe(403);
  expect((await f.post('/code/save', request, { 'Content-Type': 'text/plain' })).status).toBe(403);
  expect((await f.post('/code/save', request)).status).toBe(200);
  expect((await f.post('/code/save', request)).status).toBe(409);
  expect(readFileSync(join(f.root, request.path), 'utf8')).toBe(request.content);
  const worker = await f.get('/code/worker').then((response) => response.json());
  expect(worker.script).not.toContain('import.meta.glob');
  expect(worker.script).not.toContain('https://www.gamedev.pl');
});
it('reports only provider availability, requires opt-in and clears it on project change', async () => {
  const f = await fixture();
  expect(JSON.stringify(f.project)).not.toContain('mock-not-used');
  expect(f.project.completion.selected).toBeNull();
  const request = { projectId: f.project.projectId, provider: 'openai', consent: false };
  expect((await f.post('/code/completion/settings', request)).status).toBe(400);
  expect(
    (
      await f.post('/code/completion', {
        projectId: f.project.projectId,
        path: f.project.files[0].path,
        prefix: 'const',
        suffix: '',
      })
    ).status,
  ).toBe(400);
  expect((await f.post('/code/completion/settings', { ...request, consent: true })).status).toBe(200);
  expect((await f.get('/code/project').then((response) => response.json())).completion.selected).toBe('openai');
  expect((await f.post('/code/completion/settings', { ...request, provider: null })).status).toBe(200);
  f.switchProject();
  expect((await f.get('/code/project')).status).toBe(404);
  expect(
    (
      await f.post('/code/save', {
        projectId: f.project.projectId,
        path: f.project.files[0].path,
        version: f.project.files[0].version,
        content: 'stale',
      })
    ).status,
  ).toBe(404);
});
