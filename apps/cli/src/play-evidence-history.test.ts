import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';
import { EVIDENCE_MARKER } from './workbench-evidence.js';
import { startSessionBrowser } from './session-browser-server.js';
import { createSessionController } from './session-controller.js';

it('serves only registered session images behind authentication', async () => {
  const session = createSessionController('');
  const server = await startSessionBrowser(session);
  const url = new URL(server.url);
  const headers = {
    Authorization: `Bearer ${url.hash.slice(1)}`,
    Origin: url.origin,
    'Content-Type': 'application/json',
  };
  try {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
    const uploaded = await fetch(`${url.origin}/artifacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'shot.png',
        mime: 'image/png',
        purpose: 'reference',
        data,
        revision: '',
        device: '',
        capturedAt: new Date().toISOString(),
      }),
    }).then((r) => r.json());
    const endpoint = `${url.origin}/artifacts/${uploaded.id}`;
    expect((await fetch(endpoint)).status).toBe(401);
    expect(await fetch(endpoint, { headers }).then((r) => r.json())).toEqual({ mime: 'image/png', data });
    expect((await fetch(`${url.origin}/artifacts/00000000-0000-0000-0000-000000000000`, { headers })).status).toBe(404);
    expect((await fetch(endpoint, { headers: { ...headers, Origin: 'https://other.test' } })).status).toBe(403);
  } finally {
    session.close();
    await server.close();
  }
});
let dom: JSDOM | undefined;
afterEach(() => dom?.window.close());
it('renders images in restored and steering history and opens their original bytes', async () => {
  const id = '00000000-0000-0000-0000-000000000001';
  const prompt =
    'Fix this' +
    EVIDENCE_MARKER +
    JSON.stringify({ id, name: 'shot.png', mime: 'image/png', path: '/private/shot.png' });
  const turn = { id: 1, agent: 'claude', prompt, entries: [{ kind: 'input', text: prompt }], startedAt: 1 };
  const state = {
    sessionId: 'one',
    sourceId: 0,
    hasPreview: false,
    mode: 'prompt',
    promptId: 1,
    taskId: 0,
    identity: '',
    activity: '',
    localTask: '',
    question: '',
    choices: [],
    lines: [],
    live: [],
    queued: [],
    history: [],
    actions: [],
    addresses: [],
    agent: {
      name: 'Play',
      mode: 'use',
      modes: ['use'],
      agent: 'claude',
      agents: [],
      actions: [],
      links: [],
      view: null,
      navigation: null,
      history: [turn],
      session: null,
    },
  };
  const popup = new JSDOM('<!doctype html><body></body>');
  const open = vi.fn(() => popup.window);
  const fetchMock = vi.fn(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () => (path.startsWith('/artifacts/') ? { mime: 'image/png', data: 'aGVsbG8=' } : state),
  }));
  dom = new JSDOM(SESSION_BROWSER_PAGE, {
    url: 'http://localhost/#' + 'a'.repeat(64),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = fetchMock as unknown as typeof fetch;
      window.open = open as unknown as typeof window.open;
      window.AbortSignal.timeout = (() => new window.AbortController().signal) as typeof AbortSignal.timeout;
    },
  });
  try {
    const doc = dom.window.document;
    await vi.waitFor(() => expect(doc.querySelectorAll('.play-evidence-image img')).toHaveLength(2));
    expect(doc.querySelector('.gc-thread')!.textContent).not.toContain('Local evidence');
    expect(doc.querySelector('.gc-thread')!.textContent).not.toContain('/private');
    expect(doc.querySelector('.gc-prompt')!.textContent).toContain('Fix this');
    (doc.querySelector('.play-evidence-image') as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(popup.window.opener).toBeNull();
    expect(popup.window.document.querySelector('img')!.src).toBe('data:image/png;base64,aGVsbG8=');
    expect(fetchMock.mock.calls.some(([path]) => path === '/artifacts/' + id)).toBe(true);
  } finally {
    popup.window.close();
  }
});
