// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { CreatorProposal } from '@gamedevpl/contract';
import { ThreadStream } from './ThreadStream.js';
import type { ActivityEntry } from './buildActivityFeed.js';
import type { ProposalHandlers } from './ProposalCard.js';

vi.mock('../../submissionApi.js', () => ({
  buildMediaUrl: (_token: string, item: { ref: string }) => `/shot/${item.ref}`,
}));
vi.mock('../../visitTelemetry.js', () => ({
  recordStudioStep: () => undefined,
}));

const proposal: CreatorProposal = {
  sourceRef: 'shot-source',
  version: 'v3',
  options: [
    {
      id: 'idea_0',
      label: { en: 'Night mode', pl: 'Tryb nocny' },
      prompt: { en: 'Make the level happen at night.', pl: 'Niech poziom dzieje się nocą.' },
      frameRef: 'shot-a',
    },
  ],
};

const handlers: ProposalHandlers = {
  builder: 'platform',
  muted: false,
  onPick: () => undefined,
  onMute: () => undefined,
};

const entries: ActivityEntry[] = [
  { kind: 'revision', text: 'make it blue', at: 1 },
  { kind: 'studio', text: 'I sketched two directions.', at: 2, proposal },
];

const roots: Array<{ unmount: () => void }> = [];

afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

// The pane only reports a height once something measures it.
function sizePane(container: HTMLElement, scrollHeight: number, clientHeight: number): HTMLElement {
  const pane = container.querySelector('.studio-thread-scroll') as HTMLElement;
  Object.defineProperty(pane, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(pane, 'clientHeight', { value: clientHeight, configurable: true });
  return pane;
}

describe('ThreadStream stick-to-bottom', () => {
  it('scrolls back to the end when the concept card arrives', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const render = (proposals?: ProposalHandlers) =>
      act(() => {
        root.render(<ThreadStream token="t" entries={entries} emptyLabel="" proposals={proposals} />);
      });

    // The preference read is still pending, so no card yet.
    await render(undefined);
    expect(container.querySelector('.studio-proposal')).toBeNull();
    const pane = sizePane(container, 400, 400);
    pane.scrollTop = 0;

    // The card resolves and lands under the last turn, growing the thread.
    Object.defineProperty(pane, 'scrollHeight', { value: 900, configurable: true });
    await render(handlers);

    expect(container.querySelector('.studio-proposal')).not.toBeNull();
    expect(pane.scrollTop).toBe(500);
  });

  it('scrolls back when a muted creator turns concept cards back on', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const render = (proposals: ProposalHandlers) =>
      act(() => {
        root.render(<ThreadStream token="t" entries={entries} emptyLabel="" proposals={proposals} />);
      });

    // Muted resolves to a one-line note, not the card.
    await render({ ...handlers, muted: true });
    expect(container.querySelector('.studio-proposal')).toBeNull();
    const pane = sizePane(container, 400, 400);
    pane.scrollTop = 0;

    // The bell turns them on and the card expands the turn.
    Object.defineProperty(pane, 'scrollHeight', { value: 900, configurable: true });
    await render(handlers);

    expect(container.querySelector('.studio-proposal')).not.toBeNull();
    expect(pane.scrollTop).toBe(500);
  });

  it('leaves a reader who scrolled up where they were', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const render = (proposals?: ProposalHandlers) =>
      act(() => {
        root.render(<ThreadStream token="t" entries={entries} emptyLabel="" proposals={proposals} />);
      });

    await render(undefined);
    const pane = sizePane(container, 900, 400);
    pane.scrollTop = 0;
    act(() => {
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await render(handlers);

    expect(pane.scrollTop).toBe(0);
  });
});
