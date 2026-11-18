import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, expect, vi } from 'vitest';
import type { AppAgentState } from 'genaicode/react';
import { SESSION_BROWSER_PAGE } from '../src/session-browser-page.js';

const windows: JSDOM[] = [];
afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});
export function workbenchFixture(status = 200, mode?: string, receipt?: () => Promise<unknown>) {
  const state = {
    sessionId: 'one',
    sequence: 1,
    workspace: mode ? { mode, slug: mode === 'game' ? 'racer' : '', suggestedSlug: 'racer' } : undefined,
    sourceId: 0,
    hasPreview: false,
    mode: 'prompt',
    promptId: 1,
    taskId: 0,
    identity: 'Existing game',
    activity: 'Ready',
    localTask: '',
    question: '',
    choices: [],
    lines: ['› Turn the car red', '◆ Choose your builder.'],
    live: [],
    queued: [],
    history: ['Turn the car red'],
    actions: ['status'],
    actionCommands: { status: '/status' },
    addresses: [],
    agent: undefined as AppAgentState | undefined,
  };
  const requests: string[] = [];
  const dom = new JSDOM(SESSION_BROWSER_PAGE, {
    url: 'http://localhost/#' + 'a'.repeat(64),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = vi.fn(async (path: string) => {
        requests.push(path);
        return {
          ok: status === 200,
          status,
          json: async () =>
            path === '/commands' ? (receipt ? receipt() : { status: 'accepted', sequence: 2 }) : { ...state },
        };
      }) as unknown as typeof fetch;
      window.AbortSignal.timeout = (() => new window.AbortController().signal) as typeof AbortSignal.timeout;
      window.confirm = () => true;
    },
  });
  windows.push(dom);
  return { dom, state, requests, doc: dom.window.document };
}
// Pay the cold JSDOM parse once, outside any single test's timeout.
beforeAll(async () => {
  const { doc } = workbenchFixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  for (const dom of windows.splice(0)) dom.window.close();
}, 30_000);
