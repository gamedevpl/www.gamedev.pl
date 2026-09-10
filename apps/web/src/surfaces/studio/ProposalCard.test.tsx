// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { CreatorProposal } from '@gamedevpl/contract';
import { ProposalCard, type ProposalPick } from './ProposalCard.js';

const recordStudioStep = vi.fn();

vi.mock('../../submissionApi.js', () => ({
  buildMediaUrl: (_token: string, item: { ref: string }) => `/shot/${item.ref}`,
}));
vi.mock('../../visitTelemetry.js', () => ({
  recordStudioStep: (...args: unknown[]) => recordStudioStep(...args),
}));

const proposal = {
  sourceRef: 'shot-source',
  version: 'v3',
  options: [
    {
      id: 'idea_0',
      label: { en: 'Night mode', pl: 'Tryb nocny' },
      prompt: { en: 'Make the level happen at night.', pl: 'Niech poziom dzieje się nocą.' },
      frameRef: 'shot-a',
    },
    {
      id: 'idea_1',
      label: { en: 'More rocks', pl: 'Więcej skał' },
      prompt: { en: 'Scatter rocks across the field.', pl: 'Rozrzuć skały po polu.' },
      frameRef: 'shot-b',
    },
  ],
};

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text);
  if (!match) throw new Error(`no button "${text}"`);
  return match;
}

const roots: Array<{ unmount: () => void }> = [];

function press(key: string, init: KeyboardEventInit = {}) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

async function mount(
  handlers: Partial<Parameters<typeof ProposalCard>[0]['handlers']> = {},
  overrides: Partial<CreatorProposal> = {},
) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('pl');
  const rail = document.createElement('div');
  rail.className = 'studio-chat-rail';
  const container = document.createElement('div');
  rail.appendChild(container);
  document.body.appendChild(rail);
  const root = createRoot(container);
  roots.push(root);
  const picks: ProposalPick[] = [];
  const onMute = vi.fn();
  await act(async () => {
    root.render(
      <ProposalCard
        token="tok"
        proposal={{ ...proposal, ...overrides }}
        handlers={{ builder: 'platform', muted: false, onPick: (pick) => picks.push(pick), onMute, ...handlers }}
      />,
    );
  });
  return { container, rail, picks, onMute };
}

describe('ProposalCard', () => {
  afterEach(async () => {
    // A root left mounted over a wiped body flushes into dead nodes.
    await act(async () => {
      roots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    recordStudioStep.mockReset();
  });

  it('counts the exposure when the card comes into view, not when it mounts', async () => {
    // A long thread mounts old cards off-screen.
    let notify: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );

    await mount();
    expect(recordStudioStep).not.toHaveBeenCalled();

    await act(async () => {
      notify?.([{ isIntersecting: true }]);
    });
    expect(recordStudioStep).toHaveBeenCalledWith('proposal_shown', 'platform');

    await act(async () => {
      notify?.([{ isIntersecting: true }]);
    });
    expect(recordStudioStep).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('attributes a card to the builder that drew it, not the current one', async () => {
    // A handoff after the card was posted must not move its telemetry.
    await mount({ builder: 'platform' }, { builder: 'self' });

    expect(recordStudioStep).toHaveBeenCalledWith('proposal_shown', 'self');
  });

  it('counts no exposure for a creator who muted proposals', async () => {
    // Exposure feeds decisions-per-exposure; a placeholder is not a proposal.
    const { container } = await mount({ muted: true });

    expect(container.querySelector('.studio-proposal-thumbs')).toBeNull();
    expect(recordStudioStep).not.toHaveBeenCalled();
  });

  it('shows both concept frames labelled as AI, and records the exposure once', async () => {
    const { container } = await mount();
    const thumbs = container.querySelectorAll('.studio-proposal-thumb');
    expect(thumbs).toHaveLength(2);
    expect(container.querySelectorAll('.studio-proposal-ai')).toHaveLength(2);
    expect(container.textContent).toContain('Tryb nocny');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/shot/shot-a');
    expect(recordStudioStep).toHaveBeenCalledWith('proposal_shown', 'platform');
  });

  it('opens the dialog with the real frame and hands the pick to the composer in the reader language', async () => {
    const { container, picks } = await mount();
    await act(async () => {
      (container.querySelector('.studio-proposal-thumb') as HTMLButtonElement).click();
    });
    const dialog = document.body.querySelector('.studio-proposal-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.querySelector('.is-current img')?.getAttribute('src')).toBe('/shot/shot-source');
    await act(async () => {
      dialog!.querySelectorAll('.studio-proposal-pick')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({
      option: { id: 'idea_1' },
      frame: { source: 'channel', ref: 'shot-b' },
      text: 'Rozrzuć skały po polu.',
    });
    expect(document.body.querySelector('.studio-proposal-dialog')).toBeNull();
    expect(recordStudioStep).toHaveBeenCalledWith('proposal_picked', 'platform');
  });

  it('"not now" closes without a pick; "ask me less" tells the parent', async () => {
    const { container, picks, onMute } = await mount();
    await act(async () => {
      button(container, 'Zobacz oba pomysły').click();
    });
    await act(async () => {
      button(document.body, 'Nie teraz').click();
    });
    expect(document.body.querySelector('.studio-proposal-dialog')).toBeNull();
    expect(recordStudioStep).toHaveBeenCalledWith('proposal_postponed', 'platform');
    await act(async () => {
      button(container, 'Zobacz oba pomysły').click();
    });
    await act(async () => {
      button(document.body, 'Nie podpowiadaj mi tego').click();
    });
    expect(onMute).toHaveBeenCalledTimes(1);
    expect(picks).toHaveLength(0);
    expect(recordStudioStep).toHaveBeenCalledWith('proposal_muted', 'platform');
  });

  it('portals the comparison out of the chat rail, which would otherwise clip it', async () => {
    // A blurred backdrop makes the rail the containing block for fixed children.
    const { container, rail } = await mount();
    await act(async () => {
      (container.querySelector('.studio-proposal-thumb') as HTMLButtonElement).click();
    });

    expect(rail.querySelector('.studio-proposal-overlay')).toBeNull();
    expect(document.body.querySelector('.studio-proposal-overlay')?.parentElement).toBe(document.body);
  });

  it('holds keyboard focus inside the dialog and hands it back on close', async () => {
    const { container } = await mount();
    const opener = button(container, 'Zobacz oba pomys\u0142y');
    opener.focus();
    await act(async () => {
      opener.click();
    });

    const dialog = document.body.querySelector('.studio-proposal-dialog') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
    const focusable = [...dialog.querySelectorAll('button')];
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    await act(async () => {
      press('Tab');
    });
    expect(document.activeElement).toBe(first);

    last.focus();
    await act(async () => {
      press('Tab');
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      press('Tab', { shiftKey: true });
    });
    expect(document.activeElement).toBe(last);

    await act(async () => {
      press('Escape');
    });
    expect(document.body.querySelector('.studio-proposal-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Escape from reaching the studio shell behind the dialog', async () => {
    // The shell closes its details tab on Escape; the dialog swallows it.
    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    const { container } = await mount();
    await act(async () => {
      button(container, 'Zobacz oba pomys\u0142y').click();
    });

    await act(async () => {
      press('Escape');
    });
    expect(shell).not.toHaveBeenCalled();
    window.removeEventListener('keydown', shell);
  });

  it('renders the muted note instead of frames once the creator opted out', async () => {
    const { container } = await mount({ muted: true });
    expect(container.querySelector('.studio-proposal-thumb')).toBeNull();
    expect(container.textContent).toContain('koniec z propozycjami');
  });
});
