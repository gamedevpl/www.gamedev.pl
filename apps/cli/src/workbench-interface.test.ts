import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PLAY_STYLE } from './generated/play-ui.js';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';
import type { AppAgentState, SessionEntry } from 'genaicode/react';

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
// Pay the cold JSDOM parse once, outside any single test's timeout.
beforeAll(async () => {
  const { doc } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  for (const dom of windows.splice(0)) dom.window.close();
}, 30_000);
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

it('keeps tool output collapsed and labels the actual agent reply', async () => {
  const { doc, state } = fixture();
  state.lines = ['› Fix steering', 'codex ▸ ⚙ cat game.ts', 'codex ▸ ✓ MCP tool', 'codex ▸ I improved the controls.'];
  await vi.waitFor(() =>
    expect(doc.querySelector('.message.assistant p')?.textContent).toBe('I improved the controls.'),
  );
  expect(doc.querySelector('.message.assistant .message-author')?.textContent).toBe('codex');
  expect(doc.querySelectorAll('.message.assistant')).toHaveLength(1);
  expect(doc.querySelector('.session-output')?.textContent).toContain('⚙ cat game.ts');
  expect(doc.querySelector('.session-output')?.hasAttribute('open')).toBe(false);
});

it('keeps the latest agent update visible between tools and clears it when the turn ends or changes', async () => {
  const { doc, dom, state } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const session: NonNullable<AppAgentState['session']> = {
    agent: 'claude',
    cwd: '/game',
    status: 'running',
    queued: [],
    approvals: [],
    usage: {},
    canSteer: false,
    turns: [{ id: 1, agent: 'claude', prompt: 'Fix steering', startedAt: Date.now(), entries: [] }],
  };
  state.agent = {
    name: 'Play',
    mode: 'use',
    modes: ['use'],
    agent: 'claude',
    agents: [],
    actions: [],
    links: [],
    view: null,
    navigation: null,
    history: [],
    session,
  };
  const update = (entries: SessionEntry[]) => {
    session.turns[0].entries = entries;
    state.agent = { ...state.agent!, session: { ...session, turns: [{ ...session.turns[0] }] } };
    dom.window.dispatchEvent(new dom.window.CustomEvent('play-session', { detail: { ...state } }));
  };
  const tool: SessionEntry = { kind: 'tool', name: 'Edit', done: false };
  const first: SessionEntry = { kind: 'text', text: 'Poprawiam **sterowanie**.', streaming: false };
  const latest: SessionEntry = { kind: 'text', text: 'Sprawdzam `game.ts`.', streaming: false };
  const progress = () => doc.querySelector('[role="status"][aria-label="Agent progress"]');
  const visibleReplies = () => doc.querySelector('.gc-steps > .gc-md');

  update([tool]);
  await vi.waitFor(() => expect(doc.querySelector('.gc-fold')).not.toBeNull());
  expect(progress()).toBeNull();

  update([first]);
  await vi.waitFor(() => expect(visibleReplies()?.textContent).toContain('Poprawiam sterowanie.'));
  expect(progress()).toBeNull();

  update([first, tool]);
  await vi.waitFor(() => expect(progress()?.textContent).toContain('Poprawiam sterowanie.'));
  expect(progress()?.closest('details')).toBeNull();
  expect(progress()?.querySelector('strong')?.textContent).toBe('sterowanie');
  expect(doc.querySelector('.gc-fold')?.hasAttribute('open')).toBe(false);

  update([first, tool, latest, { kind: 'files', paths: ['/game/game.ts'] }]);
  await vi.waitFor(() => expect(progress()?.textContent).toContain('Sprawdzam game.ts.'));
  expect(progress()?.textContent).not.toContain('Poprawiam');

  update([first, tool, latest, { ...tool, done: true }]);
  await vi.waitFor(() => expect(doc.querySelector('.gc-fold-body .gc-state.gc-ok')?.textContent).toBe('✓'));
  expect(progress()?.textContent).toContain('Sprawdzam game.ts.');

  session.turns[0].result = { ok: true, text: 'Done' };
  session.status = 'idle';
  update(session.turns[0].entries);
  await vi.waitFor(() => expect(progress()).toBeNull());
  expect(visibleReplies()?.textContent).toContain('Sprawdzam game.ts.');

  session.status = 'running';
  session.turns = [{ id: 2, agent: 'claude', prompt: 'Next change', startedAt: Date.now(), entries: [] }];
  update([tool]);
  await vi.waitFor(() => expect(doc.querySelector('.gc-prompt')?.textContent).toBe('Next change'));
  expect(progress()).toBeNull();
});

it('keeps the first prompt visible while the agent conversation starts', async () => {
  const { doc, dom, state } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('conversation')!.textContent).toContain('Turn the car red'));
  dom.window.dispatchEvent(
    new dom.window.CustomEvent('play-session', {
      detail: {
        lines: [...state.lines, '› Add a blue track'],
        workspace: { mode: 'game' },
        agent: { history: [], session: null },
      },
    }),
  );
  await vi.waitFor(() => expect(doc.getElementById('conversation')!.textContent).toContain('Add a blue track'));
  expect(doc.querySelector('.conversation-welcome')).toBeNull();
  dom.window.dispatchEvent(
    new dom.window.CustomEvent('play-session', {
      detail: {
        lines: [...state.lines, '› Add a blue track'],
        workspace: { mode: 'game' },
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
          history: [],
          session: {
            agent: 'claude',
            cwd: '/game',
            status: 'running',
            queued: [],
            approvals: [],
            usage: {},
            canSteer: false,
            turns: [
              {
                id: 1,
                agent: 'claude',
                prompt: 'Add a blue track',
                entries: [
                  {
                    kind: 'tool',
                    name: 'AskUserQuestion',
                    input: {
                      questions: [
                        { question: 'Which track?', options: [{ label: 'Blue', description: 'Use blue paint' }] },
                        { question: 'How wide?', options: [{ label: 'Wide' }] },
                      ],
                    },
                    output: 'The user did not answer the questions.',
                    done: true,
                  },
                ],
                startedAt: Date.now(),
              },
            ],
          },
        },
      },
    }),
  );
  await vi.waitFor(() => expect(doc.querySelector('.gc-prompt')?.textContent).toBe('Add a blue track'));
  expect(doc.querySelector('.conversation-welcome')).toBeNull();
  expect(doc.querySelector('.gc-tool summary')?.textContent).toContain('Which track?');
  expect(doc.querySelector('.gc-tool pre')?.textContent).toContain('Blue — Use blue paint');
  expect(doc.querySelector('.gc-tool pre')?.textContent).toContain('How wide?');
  expect(doc.querySelector('.gc-tool pre')?.textContent).toContain('The user did not answer the questions.');
});

it('dismisses a settled action across updates and remounts without hiding new or active actions', async () => {
  const { doc, dom, state } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('conversation')!.textContent).toContain('Turn the car red'));
  const agent = {
    name: 'Play',
    mode: 'use',
    modes: ['use'],
    agent: 'claude',
    agents: [],
    links: [],
    view: null,
    navigation: null,
    history: [],
    session: {
      agent: 'claude',
      cwd: '/game',
      status: 'running',
      queued: [],
      approvals: [],
      usage: {},
      canSteer: false,
      turns: [{ id: 1, agent: 'claude', prompt: 'Fix controls', entries: [], startedAt: 1 }],
    },
    actions: [
      {
        id: '1',
        createdAt: 100,
        kind: 'tool',
        status: 'failed',
        summary: 'Old delivery',
        tool: { name: 'game_submit', args: {} },
        result: 'Failed',
      },
      {
        id: '2',
        createdAt: 101,
        kind: 'tool',
        status: 'pending',
        summary: 'Awaiting decision',
        tool: { name: 'game_submit', args: {} },
      },
      {
        id: '3',
        createdAt: 102,
        kind: 'tool',
        status: 'running',
        summary: 'Still running',
        tool: { name: 'game_submit', args: {} },
      },
    ],
  };
  const update = (value: unknown) =>
    dom.window.dispatchEvent(
      new dom.window.CustomEvent('play-session', {
        detail: { lines: state.lines, workspace: { mode: 'game' }, agent: value },
      }),
    );
  update(agent);
  await vi.waitFor(() => expect(doc.querySelector('[aria-label="Dismiss Old delivery"]')).not.toBeNull());
  expect(doc.querySelectorAll('.play-dismiss-action')).toHaveLength(1);
  (doc.querySelector('[aria-label="Dismiss Old delivery"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(doc.querySelector('.gc-failed')).toBeNull());
  expect(doc.querySelector('.gc-pending')?.textContent).toContain('Awaiting decision');
  expect(doc.querySelector('.gc-running')?.textContent).toContain('Still running');
  update(null);
  await vi.waitFor(() => expect(doc.querySelector('.play-agent')).toBeNull());
  update(agent);
  await vi.waitFor(() => expect(doc.querySelector('.gc-pending')).not.toBeNull());
  expect(doc.querySelector('.gc-failed')).toBeNull();
  update({ ...agent, actions: [{ ...agent.actions[0], createdAt: 200, summary: 'New delivery' }] });
  await vi.waitFor(() => expect(doc.querySelector('.gc-failed')?.textContent).toContain('New delivery'));
});

it('shows action approval once and restores unrelated questions on the next poll', async () => {
  const { doc, dom, state } = fixture();
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const next = {
    ...state,
    mode: 'pick',
    approvalPending: true,
    question: 'Deliver racer',
    choices: [
      { label: 'Approve', value: 'Approve' },
      { label: 'Reject', value: 'Reject' },
    ],
    agent: { actions: [{ status: 'pending', summary: 'Deliver racer' }] },
  };
  const render = (value: unknown) => dom.window.eval('render(' + JSON.stringify(value) + ')');
  render(next);
  expect(doc.getElementById('question')!.hidden).toBe(true);
  expect(doc.getElementById('choices')!.hidden).toBe(true);
  expect(doc.getElementById('destination')!.textContent).toBe('Review the pending action above');
  render({ ...next, agent: { actions: [] } });
  expect(doc.getElementById('question')!.hidden).toBe(false);
  expect(doc.getElementById('choices')!.hidden).toBe(false);
  expect(doc.getElementById('choices')!.textContent).toBe('ApproveReject');
  render({ ...next, question: 'Choose a color', promptId: 2, choices: [{ label: 'Red', value: 'Red' }] });
  expect(doc.getElementById('question')!.hidden).toBe(false);
  expect(doc.getElementById('choices')!.textContent).toBe('Red');
});

it('embeds only the two WOFF2 font weights used by Play', () => {
  expect(PLAY_STYLE.match(/@font-face/g)).toHaveLength(2);
  expect(PLAY_STYLE).not.toMatch(/font-weight:300|format\(["']?woff["']?\)/);
  // Includes genaicode/react's chat styles (~15 KB) for the Play agent.
  expect(PLAY_STYLE.length).toBeLessThan(140_000);
});

it('declares mascot favicon link in head', () => {
  const dom = new JSDOM(SESSION_BROWSER_PAGE);
  const link = dom.window.document.querySelector('link[rel="icon"]');
  expect(link).not.toBeNull();
  expect(link?.getAttribute('type')).toBe('image/svg+xml');
  expect(link?.getAttribute('href')).toContain('data:image/svg+xml,');
});
