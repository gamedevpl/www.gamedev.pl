import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';

const windows: JSDOM[] = [];
afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});
function fixture(status = 200, mode?: string) {
  const state = {
    sessionId: 'one',
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
          json: async () => (path === '/commands' ? { status: 'accepted' } : { ...state }),
        };
      }) as unknown as typeof fetch;
      window.AbortSignal.timeout = (() => new window.AbortController().signal) as typeof AbortSignal.timeout;
      window.confirm = () => true;
    },
  });
  windows.push(dom);
  return { dom, state, requests, doc: dom.window.document };
}
it('mounts working controls and opens chat without making the game inert or replacing it', async () => {
  const { doc } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const frame = doc.getElementById('game');
  (doc.getElementById('edit') as HTMLButtonElement).click();
  expect(doc.getElementById('panel')!.hidden).toBe(false);
  expect(doc.querySelector('dialog')).toBeNull();
  expect(doc.querySelector('[inert]')).toBeNull();
  expect(doc.getElementById('game')).toBe(frame);
  expect(doc.getElementById('destination')!.textContent).toContain('session assistant');
  await vi.waitFor(() => expect(doc.getElementById('conversation')!.textContent).toContain('Turn the car red'));
});
it('shows session access recovery instead of creation and keeps an editable draft', async () => {
  const { doc } = fixture(401);
  await vi.waitFor(() => expect(doc.getElementById('empty-title')!.textContent).toBe('Reopen your Play session'));
  expect(doc.getElementById('empty-description')!.textContent).toContain('complete launch link');
  expect((doc.getElementById('send') as HTMLButtonElement).disabled).toBe(true);
  expect((doc.getElementById('prompt') as HTMLTextAreaElement).disabled).toBe(false);
});
it('completes a supported slash command and recalls shared terminal history', async () => {
  const { doc, dom } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const draft = doc.getElementById('prompt') as HTMLTextAreaElement;
  draft.value = '/sta';
  draft.dispatchEvent(new dom.window.Event('input'));
  draft.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(draft.value).toBe('/status');
  draft.value = '';
  draft.setSelectionRange(0, 0);
  draft.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(draft.value).toBe('Turn the car red');
});

it('sends slash actions through guarded commands and clears only the accepted command draft', async () => {
  const { doc, dom, requests } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const draft = doc.getElementById('prompt') as HTMLTextAreaElement;
  draft.value = '/status';
  doc.getElementById('composer')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(draft.value).toBe(''));
  expect(requests.filter((path) => path === '/commands')).toHaveLength(1);
  expect(doc.getElementById('details-section')!.hidden).toBe(false);
});
it('does not reopen a dismissed question or close its attachment drawer on each poll', async () => {
  const { doc, state } = fixture();
  state.question = 'Choose a color';
  await vi.waitFor(() => expect(doc.getElementById('panel')!.hidden).toBe(false));
  (doc.getElementById('attachments-open') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(doc.getElementById('workbench-tools')!.hidden).toBe(false);
  (doc.getElementById('drawer-close') as HTMLButtonElement).click();
  (doc.getElementById('close') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(doc.getElementById('panel')!.hidden).toBe(true);
});

it('opens a home and lets the user choose intake without dispatching an agent', async () => {
  const { doc, requests } = fixture(200, 'home');
  await vi.waitFor(() => expect(doc.getElementById('workspace-home')!.hidden).toBe(false));
  expect(doc.getElementById('home-continue-label')!.textContent).toContain('racer');
  (doc.getElementById('home-create') as HTMLButtonElement).click();
  expect(doc.body.dataset.intake).toBe('true');
  expect(doc.getElementById('panel')!.hidden).toBe(false);
  expect(doc.getElementById('workspace-home')!.hidden).toBe(true);
  expect(requests.filter((path) => path === '/commands')).toHaveLength(0);
  expect((doc.getElementById('prompt') as HTMLTextAreaElement).placeholder).toContain('make');
  (doc.getElementById('close') as HTMLButtonElement).click();
  expect(doc.getElementById('workspace-home')!.hidden).toBe(false);
  expect(doc.body.dataset.intake).toBe('false');
});
it('transitions from creation conversation to the game workspace without remounting the stage', async () => {
  const { doc, state } = fixture(200, 'create');
  const frame = doc.getElementById('game');
  await vi.waitFor(() => expect(doc.body.dataset.intake).toBe('true'));
  state.workspace!.mode = 'game';
  state.workspace!.slug = 'new-game';
  state.hasPreview = true;
  await vi.waitFor(() => expect(doc.body.dataset.intake).toBe('false'), { timeout: 2000 });
  expect(doc.getElementById('workspace-home')!.hidden).toBe(true);
  expect(doc.getElementById('game')).toBe(frame);
  expect(doc.getElementById('panel-title')!.textContent).toBe('Conversation');
});
