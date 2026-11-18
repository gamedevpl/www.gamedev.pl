import { expect, it, vi } from 'vitest';
import type { SessionEntry } from 'genaicode/react';
import { workbenchFixture as fixture } from '../test/workbench-interface-fixture.js';

it.each(['accepted', 'stale'])('shows a screenshot before the receipt and handles %s', async (status) => {
  let finish!: (reply: unknown) => void;
  const receipt = new Promise((resolve) => {
    finish = resolve;
  });
  const { dom, doc, state, requests } = fixture(200, undefined, () => receipt);
  await vi.waitFor(() => expect(doc.getElementById('connection')!.textContent).toBe('Connected · ready'));
  const submit = () => (doc.getElementById('send') as HTMLButtonElement).click();
  submit();
  expect(requests).not.toContain('/commands');
  dom.window.eval("attachments.push({id:'image',name:'screen.png',purpose:'reference',bytes:42});tray()");
  submit();
  await vi.waitFor(() => expect(doc.querySelector('.play-outgoing')?.textContent).toContain('screen.png'));
  expect(requests.filter((path) => path === '/commands')).toHaveLength(1);
  dom.window.eval("attachments.push({id:'next',name:'next.png',purpose:'reference',bytes:10});tray()");
  finish({ status, sequence: 2 });
  const tray = doc.getElementById('attachments')!;
  if (status === 'accepted') {
    await vi.waitFor(() => expect(tray.textContent).not.toContain('screen.png'));
    expect(doc.querySelector('.play-outgoing')).not.toBeNull();
    state.sequence = 2;
    state.lines.push('› Attached file · 📎 screen.png');
    dom.window.eval('render(' + JSON.stringify(state) + ')');
    await vi.waitFor(() => expect(doc.querySelector('.play-outgoing')).toBeNull());
    expect(doc.querySelector('#conversation')?.textContent?.match(/screen\.png/g)).toHaveLength(1);
  } else {
    await vi.waitFor(() => expect(doc.querySelector('.play-outgoing')).toBeNull());
    expect(tray.textContent).toContain('screen.png');
  }
  expect(tray.textContent).toContain('next.png');
});

it('keeps an identical follow-up visible until the active agent shows the new copy', async () => {
  const { dom, state, doc } = fixture();
  const prompt = 'Keep going';
  const turn = { id: 1, agent: 'claude', prompt, startedAt: 1, entries: [] as SessionEntry[] };
  state.mode = 'busy';
  state.localTask = 'claude';
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
    session: {
      agent: 'claude',
      cwd: '/game',
      status: 'running',
      queued: [],
      approvals: [],
      usage: {},
      canSteer: true,
      turns: [turn],
    },
  };
  const render = () => dom.window.eval('render(' + JSON.stringify({ ...state, canSteer: true }) + ')');
  await vi.waitFor(() => expect(doc.querySelector('.gc-prompt')?.textContent).toBe(prompt));
  render();
  (doc.getElementById('prompt') as HTMLTextAreaElement).value = prompt;
  (doc.getElementById('send') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(doc.querySelector('.play-outgoing')?.textContent).toContain(prompt));
  state.sequence++;
  turn.entries.push({ kind: 'input', text: 'Another message' });
  render();
  await vi.waitFor(() => expect(doc.querySelector('.gc-steer')?.textContent).toContain('Another message'));
  expect(doc.querySelector('.play-outgoing')).not.toBeNull();
  turn.entries.push({ kind: 'input', text: prompt });
  render();
  await vi.waitFor(() => expect(doc.querySelector('.play-outgoing')).toBeNull());
  expect(doc.querySelectorAll('.gc-steer')).toHaveLength(2);
});
