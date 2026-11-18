import { afterEach, expect, it, vi } from 'vitest';
import { genaicode, type GenerationResult, type ModelProvider } from 'genaicode';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintAccessTokenFor } from '../platform/access-token-service.js';

const UID = 'g:visitor';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});

const usage = { inputTokens: 100, outputTokens: 20 };
const say = (text: string): GenerationResult => ({ parts: [{ type: 'text', text }], usage });
const callTool = (name: string, args: Record<string, unknown>): GenerationResult => ({
  parts: [{ type: 'toolCall', toolCall: { id: `id-${name}`, name, arguments: args } }],
  usage,
});

async function fixture(steps: GenerationResult[] = [say('Try Neon Canal.')], quota = 2) {
  vi.stubEnv('SITE_ASSISTANT', 'true');
  const store = new InMemoryStore();
  await store.upsertUser({ uid: UID });
  const { token } = await mintAccessTokenFor(store, { uid: UID, name: 'test', createdByUid: UID });
  const generate = vi.fn(async () => {
    const step = steps.shift();
    if (!step) throw new Error('the script ran out');
    return step;
  });
  const provider: ModelProvider = { name: 'fake', capabilities: { tools: true }, generate };
  const app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    siteAssistant: { client: genaicode(provider), dailyPromptQuota: quota },
  });
  apps.push(app);
  const headers = { authorization: `Bearer ${token}` };
  const turn = (payload: unknown = { prompt: 'what should I play?' }, auth: Record<string, string> = headers) =>
    app.inject({ method: 'POST', url: '/api/assistant/turn', headers: auth, payload });
  const info = () => app.inject({ method: 'GET', url: '/api/assistant/info', headers });
  const lines = (body: string) =>
    body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  const today = new Date().toISOString().slice(0, 10);
  return { store, app, headers, turn, info, lines, generate, today };
}

it('answers a signed-in visitor and counts the tokens on its own lane', async () => {
  const f = await fixture();
  expect((await f.info()).json()).toMatchObject({ available: true, inputs: [] });
  const response = await f.turn();
  expect(response.statusCode).toBe(200);
  const end = f.lines(response.body).at(-1)!;
  expect(end).toMatchObject({ type: 'turn-end', status: 'completed' });
  expect(response.body).toContain('Try Neon Canal.');
  expect(await f.store.getGlobalAssistantTokenCount(f.today)).toBe(120);
  expect((await f.store.getUsage(UID, f.today)).assistantPrompts).toBe(1);
  // Its spend never lands on another lane's counter.
  expect(await f.store.getGlobalTabCompleteTokenCount(f.today)).toBe(0);
});

it('serves nobody who is signed out, blocked or cross-site', async () => {
  const f = await fixture();
  expect((await f.turn(undefined, {})).statusCode).toBe(401);
  const crossSite = await f.turn(undefined, { ...f.headers, origin: 'https://evil.example' });
  expect(crossSite.statusCode).toBe(403);
  await f.store.upsertUser({ uid: UID, tier: 'blocked' });
  expect((await f.turn()).statusCode).toBe(403);
  expect(f.generate).not.toHaveBeenCalled();
});

it('is off until the deploy flag turns it on', async () => {
  const f = await fixture();
  vi.stubEnv('SITE_ASSISTANT', undefined);
  expect((await f.turn()).statusCode).toBe(404);
  const info = await f.info();
  expect(info.statusCode).toBe(200);
  expect(info.json()).toEqual({ name: 'gamedev.pl', inputs: [], available: false, enabled: false });
  expect((await f.app.inject({ method: 'GET', url: '/api/assistant/info' })).statusCode).toBe(401);
  expect(f.generate).not.toHaveBeenCalled();
});

it('stops at the daily prompts of one visitor and says when it is back', async () => {
  const f = await fixture([say('one'), say('two'), say('three')]);
  expect((await f.turn()).statusCode).toBe(200);
  expect((await f.turn()).statusCode).toBe(200);
  const refused = await f.turn();
  expect(refused.statusCode).toBe(429);
  expect(refused.json().failure).toMatchObject({ kind: 'quota' });
  expect(f.generate).toHaveBeenCalledTimes(2);
  const info = (await f.info()).json();
  expect(info.available).toBe(false);
  expect(info.resetsAt).toBeGreaterThan(Date.now());
});

it('rests when the operator pauses the lane, without spending a prompt', async () => {
  const f = await fixture();
  await f.store.setCreationLimits({ assistantPaused: true }, 'test');
  expect((await f.info()).json().available).toBe(false);
  const refused = await f.turn();
  expect(refused.statusCode).toBe(429);
  expect(f.generate).not.toHaveBeenCalled();
  expect((await f.store.getUsage(UID, f.today)).assistantPrompts ?? 0).toBe(0);
});

it('refuses once the shared daily token cap cannot hold another call', async () => {
  const f = await fixture();
  await f.store.setCreationLimits({ globalDailyAssistantTokenCap: 300 }, 'test');
  const refused = await f.turn();
  expect(f.generate).not.toHaveBeenCalled();
  expect(f.lines(refused.body).at(-1)).toMatchObject({ status: 'failed', failure: { kind: 'quota' } });
  expect(await f.store.getGlobalAssistantTokenCount(f.today)).toBe(0);
});

it('hands a page tool call to the page and goes on with its result for free', async () => {
  const f = await fixture([callTool('search_games', { query: 'racing' }), say('Neon Canal fits.')], 1);
  const waiting = f.lines((await f.turn()).body).at(-1)!;
  expect(waiting).toMatchObject({ status: 'waiting' });
  const calls = waiting.calls as { id: string; name: string }[];
  expect(calls.map((call) => call.name)).toEqual(['search_games']);
  const done = await f.turn({
    state: waiting.state,
    results: [{ id: calls[0]!.id, output: '[{"slug":"neon-canal","title":"Neon Canal"}]' }],
  });
  expect(done.body).toContain('Neon Canal fits.');
  // One prompt, though the page posted twice.
  expect((await f.store.getUsage(UID, f.today)).assistantPrompts).toBe(1);
});

it('lets the model call only the tools pinned on the server', async () => {
  const f = await fixture();
  await f.turn({ prompt: 'hi', tools: [{ name: 'delete_everything', description: 'x' }] });
  const request = f.generate.mock.calls[0]![0] as { tools?: { name: string }[] };
  expect((request.tools ?? []).map((tool) => tool.name)).toEqual(['search_games', 'open_game', 'open_page']);
});

it('answers over a real connection, and stops the model when the visitor leaves', async () => {
  const f = await fixture([say('Still here.')]);
  const address = await f.app.listen({ port: 0, host: '127.0.0.1' });
  const post = (signal?: AbortSignal) =>
    fetch(`${address}/api/assistant/turn`, {
      method: 'POST',
      headers: { ...f.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hi' }),
      signal,
    });
  // The request body ending must not read as the visitor leaving.
  expect(await (await post()).text()).toContain('Still here.');

  let seen: AbortSignal | undefined;
  const stopped = new Promise<void>((resolve) => {
    f.generate.mockImplementationOnce(async (request: { signal?: AbortSignal }) => {
      seen = request.signal;
      request.signal?.addEventListener('abort', () => resolve());
      return await new Promise<never>(() => {});
    });
  });
  const leaving = new AbortController();
  const pending = post(leaving.signal).catch(() => undefined);
  await vi.waitFor(() => expect(seen).toBeDefined());
  leaving.abort();
  await stopped;
  await pending;
  expect(seen!.aborted).toBe(true);
});
