import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { SESSION_BROWSER_SCRIPT } from './session-browser-script.js';

it.each(['ordinary', 'question', 'choice'])(
  'marks staged evidence sent only once a %s answer sends it',
  async (kind) => {
    const fields = new Map<string, { textContent: string }>();
    const attachments = [{ id: 'image' }, { id: 'trace' }];
    const api = vi.fn(async () => ({ status: 'accepted' }));
    const draft = { value: 'Fix this image' };
    const state = {
      sessionId: 'session',
      promptId: 1,
      mode: kind === 'choice' ? 'pick' : 'prompt',
      question: kind === 'question' ? 'Which color?' : '',
      choices: kind === 'choice' ? ['Red'] : [],
    };
    const context = {
      api,
      draft,
      state,
      attachments,
      online: true,
      pending: undefined,
      sending: false,
      crypto: { randomUUID: () => 'command-' + api.mock.calls.length },
      sessionStorage: { setItem: vi.fn(), removeItem: vi.fn() },
      controls: () => {},
      tray: () => {},
      staged: () => attachments.filter((a: { sent?: boolean }) => !a.sent),
      el: (id: string) => {
        if (!fields.has(id)) fields.set(id, { textContent: '' });
        return fields.get(id);
      },
    };
    const start = SESSION_BROWSER_SCRIPT.indexOf('async function deliver()');
    const end = SESSION_BROWSER_SCRIPT.indexOf("el('composer').onsubmit", start);
    runInNewContext(SESSION_BROWSER_SCRIPT.slice(start, end), context);
    const client = context as typeof context & { send(command: unknown): void };
    client.send({ kind: 'input', promptId: 1, text: draft.value });
    await vi.waitFor(() => expect(context.pending).toBeUndefined());
    expect(context.attachments.map((a: { sent?: boolean }) => Boolean(a.sent))).toEqual(
      kind === 'ordinary' ? [true, true] : [false, false],
    );
    expect(draft.value).toBe(kind === 'choice' ? 'Fix this image' : '');
    const sent = (api.mock.calls[0] as unknown as [string, { command: object }])[1].command;
    if (kind === 'ordinary') expect(sent).toHaveProperty('attachments', ['image', 'trace']);
    else expect(sent).not.toHaveProperty('attachments');
    state.mode = 'prompt';
    state.question = '';
    state.choices = [];
    state.promptId = 2;
    draft.value = 'Make the car red';
    client.send({ kind: 'input', promptId: 2, text: draft.value });
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[1]).toEqual([
      '/commands',
      expect.objectContaining({
        command:
          kind === 'ordinary'
            ? expect.not.objectContaining({ attachments: expect.anything() })
            : expect.objectContaining({ text: 'Make the car red', attachments: ['image', 'trace'] }),
      }),
    ]);
  },
);

it.each(['restored', 'late acceptance', 'late failure'])(
  'releases a stale session receipt while preserving the draft (%s)',
  async (mode) => {
    let finish!: (value: { status: string }) => void;
    let fail!: (error: Error) => void;
    const api = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      )
      .mockResolvedValue({ status: 'accepted' });
    const fields = new Map<string, { textContent: string; disabled: boolean; children: never[] }>();
    const context = {
      pending: {
        envelope: { sessionId: 'old', command: { kind: 'input' } },
        text: 'Keep this draft',
        clearDraft: true,
      } as unknown,
      sending: false,
      online: true,
      stopping: -1,
      state: { sessionId: 'new', mode: 'prompt', question: '', choices: [], promptId: 2 },
      draft: { value: 'Keep this draft' },
      attachments: [{ id: 'image' }],
      api,
      sessionStorage: { removeItem: vi.fn(), setItem: vi.fn() },
      crypto: { randomUUID: () => 'fresh-command' },
      tray: vi.fn(),
      staged: () => context.attachments,
      el: (id: string) => {
        if (!fields.has(id)) fields.set(id, { textContent: '', disabled: false, children: [] });
        return fields.get(id)!;
      },
    };
    const helpers = SESSION_BROWSER_SCRIPT.slice(
      SESSION_BROWSER_SCRIPT.indexOf('function controls()'),
      SESSION_BROWSER_SCRIPT.indexOf('function render('),
    );
    const start = SESSION_BROWSER_SCRIPT.indexOf('async function deliver()');
    runInNewContext(
      helpers + SESSION_BROWSER_SCRIPT.slice(start, SESSION_BROWSER_SCRIPT.indexOf("el('composer').onsubmit", start)),
      context,
    );
    const client = context as typeof context & {
      reconcilePending(id: string): void;
      controls(): void;
      deliver(): Promise<void>;
      send(command: unknown): void;
    };
    client.reconcilePending('old');
    expect(context.pending).toBeDefined();
    const delivery = mode === 'restored' ? undefined : client.deliver();
    client.reconcilePending('new');
    expect(context.pending).toBeUndefined();
    expect(context.sessionStorage.removeItem).toHaveBeenCalledWith('play-pending');
    if (mode === 'late acceptance') finish({ status: 'accepted' });
    if (mode === 'late failure') fail(Error('Session unavailable (409)'));
    await delivery;
    client.controls();
    expect(context.draft.value).toBe('Keep this draft');
    expect(context.attachments).toEqual([{ id: 'image' }]);
    expect(context.online).toBe(true);
    expect(context.el('send').disabled).toBe(false);
    expect(context.el('run-operation').disabled).toBe(false);
    expect(context.el('feedback').textContent).toContain('previous request was not resent');
    if (mode === 'restored') api.mockReset().mockResolvedValue({ status: 'accepted' });
    client.send({ kind: 'input', promptId: 2, text: context.draft.value });
    await vi.waitFor(() => expect(context.pending).toBeUndefined());
    expect(api.mock.calls.at(-1)?.[1]).toMatchObject({ sessionId: 'new', command: { id: 'fresh-command' } });
  },
);
