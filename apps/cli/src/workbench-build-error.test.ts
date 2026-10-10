import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';

const windows: JSDOM[] = [];
afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});
const error = 'No matching export in "game/sound.ts" for import "cue"\ngame/mines.ts:1:9\n<script>untrusted()</script>';
function fixture() {
  const state = {
    sessionId: 'one',
    sourceId: 1,
    hasPreview: true,
    mode: 'prompt',
    promptId: 1,
    taskId: 0,
    identity: 'Existing game',
    activity: 'Ready',
    localTask: '',
    question: '',
    choices: [] as { label: string; value: string }[],
    lines: [],
    live: [],
    queued: [],
    history: [],
    actions: [],
    actionCommands: {},
    addresses: [],
  };
  const build = { sourceId: 1, revision: '', busy: false, stale: true, error, canRetry: true };
  const requests: { path: string; body?: Record<string, unknown> }[] = [];
  let upload = async () => {};
  const dom = new JSDOM(SESSION_BROWSER_PAGE, {
    url: 'http://localhost/#' + 'a'.repeat(64),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.AbortSignal.timeout = (() => new window.AbortController().signal) as typeof AbortSignal.timeout;
      window.fetch = vi.fn(async (path: string, options?: RequestInit) => {
        const body = options?.body ? JSON.parse(String(options.body)) : undefined;
        requests.push({ path, body });
        if (path === '/artifacts') await upload();
        return {
          ok: true,
          status: 200,
          json: async () =>
            path === '/state'
              ? { ...state }
              : path === '/preview/status'
                ? { ...build }
                : path === '/artifacts'
                  ? {
                      id: 'evidence',
                      name: body.name,
                      mime: body.mime,
                      purpose: body.purpose,
                      bytes: 100,
                      revision: body.revision,
                    }
                  : path === '/commands'
                    ? { status: 'accepted' }
                    : { sourceId: body.sourceId },
        };
      }) as unknown as typeof fetch;
    },
  });
  windows.push(dom);
  const doc = dom.window.document;
  const button = (id: string) => doc.getElementById(id) as HTMLButtonElement;
  const ready = () =>
    vi.waitFor(() => expect(doc.getElementById('build-error')!.hidden).toBe(false), { timeout: 3000 });
  return {
    dom,
    doc,
    state,
    build,
    requests,
    button,
    ready,
    setUpload: (next: typeof upload) => {
      upload = next;
    },
  };
}

it('replaces endless loading with an actionable failure and renders diagnostics as text', async () => {
  const f = fixture();
  await f.ready();
  expect(f.doc.getElementById('empty-title')!.textContent).toBe('Build failed');
  expect(f.doc.getElementById('build-error-text')!.textContent).toBe(error);
  expect(f.doc.getElementById('build-error-text')!.children).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(f.doc.getElementById('empty-title')!.textContent).toBe('Build failed');
  f.build.error = '';
  f.build.busy = true;
  await vi.waitFor(() => expect(f.doc.getElementById('build-error')!.hidden).toBe(true), { timeout: 2000 });
  await vi.waitFor(() => expect(f.doc.getElementById('empty-title')!.textContent).toBe('Preparing your game…'), {
    timeout: 2000,
  });
});

it.each(['', 'My existing request'])(
  'prepares diagnostic evidence without dispatching or replacing draft %j',
  async (text) => {
    const f = fixture();
    await f.ready();
    const draft = f.doc.getElementById('prompt') as HTMLTextAreaElement;
    draft.value = text;
    f.button('build-error-fix').click();
    await vi.waitFor(() => expect(f.doc.getElementById('attachments')!.textContent).toContain('build-error.txt'));
    expect(f.doc.getElementById('panel')!.hidden).toBe(false);
    expect(draft.value).toBe(
      text ||
        'Fix the local game build error in the attached diagnostics and verify that the game builds successfully.',
    );
    expect(f.requests.filter((r) => r.path === '/commands')).toHaveLength(0);
    const payload = f.requests.find((r) => r.path === '/artifacts')!.body!;
    expect(payload.purpose).toBe('diagnostic');
    expect(Buffer.from(String(payload.data), 'base64').toString()).toContain(error);
    f.button('build-error-fix').click();
    await vi.waitFor(() => expect(f.button('build-error-fix').disabled).toBe(false));
    expect(f.requests.filter((r) => r.path === '/artifacts')).toHaveLength(1);
    f.doc.getElementById('composer')!.dispatchEvent(new f.dom.window.Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(f.requests.filter((r) => r.path === '/commands')).toHaveLength(1));
    expect(f.requests.find((r) => r.path === '/commands')!.body).toMatchObject({
      command: { kind: 'input', attachments: ['evidence'] },
    });
  },
);

it('retries the current source without dispatching an agent and hides unsupported retries', async () => {
  const f = fixture();
  await f.ready();
  f.button('build-error-retry').click();
  await vi.waitFor(() => expect(f.requests).toContainEqual({ path: '/preview/retry', body: { sourceId: 1 } }));
  expect(f.requests.filter((r) => r.path === '/commands')).toHaveLength(0);
  f.build.canRetry = false;
  await vi.waitFor(() => expect(f.button('build-error-retry').hidden).toBe(true), { timeout: 2000 });
});

it('keeps approvals and builder choices separate from repair requests', async () => {
  const f = fixture();
  f.state.question = 'Allow this command?';
  f.state.choices = [{ label: 'Allow once', value: 'yes' }];
  await f.ready();
  expect(f.button('build-error-fix').disabled).toBe(true);
  expect(f.doc.getElementById('build-error-question')!.hidden).toBe(false);
  f.button('build-error-fix').click();
  expect(f.requests.filter((r) => r.path === '/artifacts')).toHaveLength(0);
  f.state.question = '';
  f.state.choices = [];
  await vi.waitFor(() => expect(f.button('build-error-fix').disabled).toBe(false), { timeout: 2000 });
  expect(f.doc.getElementById('build-error-question')!.hidden).toBe(true);
});

it('discards an in-flight repair attachment when the game changes', async () => {
  const f = fixture();
  await f.ready();
  let release!: () => void;
  f.setUpload(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const draft = f.doc.getElementById('prompt') as HTMLTextAreaElement;
  draft.value = 'Keep this';
  f.button('build-error-fix').click();
  await vi.waitFor(() => expect(release).toBeDefined());
  f.state.sourceId = 2;
  f.state.hasPreview = false;
  await vi.waitFor(() => expect(f.doc.getElementById('build-error')!.hidden).toBe(true), { timeout: 2000 });
  release();
  await vi.waitFor(() => expect(f.button('build-error-fix').textContent).toBe('Fix with agent'));
  expect(f.doc.getElementById('attachments')!.textContent).toBe('');
  expect(draft.value).toBe('Keep this');
  expect(f.requests.filter((r) => r.path === '/commands')).toHaveLength(0);
});

it('copies compiler diagnostics and offers selection when clipboard access fails', async () => {
  const f = fixture();
  await f.ready();
  const copy = vi.fn(async () => {});
  Object.defineProperty(f.dom.window.navigator, 'clipboard', { value: { writeText: copy } });
  const button = f.button('build-error-copy');
  await button.onclick!(new f.dom.window.MouseEvent('click'));
  expect(copy).toHaveBeenCalledWith(error);
  copy.mockRejectedValueOnce(new Error('Denied'));
  // Await the handler before polling rewrites the selected text.
  await button.onclick!(new f.dom.window.MouseEvent('click'));
  expect((f.doc.getElementById('build-error-details') as HTMLDetailsElement).open).toBe(true);
  expect(f.dom.window.getSelection()!.toString()).toBe(error);
});
