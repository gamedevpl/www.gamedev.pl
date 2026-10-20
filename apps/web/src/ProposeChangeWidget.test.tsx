// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const authState = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...authState, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

import { ProposeChangeWidget } from './ProposeChangeWidget.js';
import { proposeErrorKey, resetProposeEligibilityCache } from './proposeEligibility.js';

type Reply = { status: number; body: unknown };

let container: HTMLDivElement;
let root: Root | null = null;
let eligibility: Reply;
let submit: Reply;
const posts: Array<{ url: string; body: unknown }> = [];

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authState.user = { uid: 'player-1' };
  resetProposeEligibilityCache();
  eligibility = { status: 200, body: { canPropose: true } };
  submit = { status: 201, body: { proposal: { id: 'p1', state: 'in_review' } } };
  posts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const reply = init?.method === 'POST' ? submit : eligibility;
      if (init?.method === 'POST') posts.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function draw(slug = 'neon-courier') {
  root = createRoot(container);
  await act(async () => {
    root!.render(<ProposeChangeWidget slug={slug} />);
  });
  await flush();
}

function trigger(): HTMLButtonElement | null {
  return container.querySelector('.propose-change-btn');
}

async function open() {
  await act(async () => trigger()!.click());
}

function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function fill(title: string, description: string) {
  type(container.querySelector<HTMLInputElement>('input[name="title"]')!, title);
  type(container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!, description);
}

function submitButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('.propose-form button[type="submit"]')!;
}

async function send() {
  await act(async () => submitButton().click());
  await flush();
}

const DESCRIPTION = 'Add a double jump so the rooftops are reachable.';

describe('ProposeChangeWidget visibility', () => {
  it('shows for a signed-in player when the creator takes proposals', async () => {
    await draw();
    expect(trigger()?.textContent).toContain('Propose a change');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/games/neon-courier/contributions', expect.anything());
  });

  it('stays hidden when the game does not take proposals', async () => {
    eligibility = { status: 200, body: { canPropose: false, reason: 'contributions_off' } };
    await draw();
    expect(trigger()).toBeNull();
  });

  it('stays hidden, without asking, when signed out', async () => {
    authState.user = null;
    await draw();
    expect(trigger()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays hidden when the eligibility check fails', async () => {
    eligibility = { status: 500, body: {} };
    await draw();
    expect(trigger()).toBeNull();
  });

  it('asks once per game and reuses the answer', async () => {
    await draw();
    act(() => root?.unmount());
    await draw();
    expect(trigger()).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ProposeChangeWidget form', () => {
  it('explains who decides and that no code is copied', async () => {
    await draw();
    await open();
    expect(container.querySelector('.propose-note')?.textContent).toBe(
      'The creator decides; if accepted, their AI agent builds it — your text is used, not copied code.',
    );
  });

  it('enforces the title and description limits with live counters', async () => {
    await draw();
    await open();
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const description = container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!;
    expect(title.maxLength).toBe(120);
    expect(description.maxLength).toBe(2000);
    expect(submitButton().disabled).toBe(true);

    fill('Hi', DESCRIPTION);
    expect(submitButton().disabled).toBe(true);
    expect(container.querySelector('.propose-counter.is-short')?.textContent).toContain('At least 3 characters');

    fill('Double jump', 'Too short');
    expect(submitButton().disabled).toBe(true);

    fill('Double jump', DESCRIPTION);
    expect(submitButton().disabled).toBe(false);
    const counters = [...container.querySelectorAll('.propose-counter')].map((node) => node.textContent);
    expect(counters).toEqual(['11/120', `${DESCRIPTION.length}/2000`]);
    expect(container.querySelector('.propose-counter.is-short')).toBeNull();
  });

  it('sends the trimmed text and links to the tracker', async () => {
    await draw();
    await open();
    fill('  Double jump  ', `  ${DESCRIPTION}  `);
    await send();
    expect(posts).toEqual([
      { url: '/api/games/neon-courier/proposals', body: { title: 'Double jump', description: DESCRIPTION } },
    ]);
    expect(container.textContent).toContain('Sent! The creator will review your proposal.');
    expect(container.querySelector<HTMLAnchorElement>('a.propose-track')?.getAttribute('href')).toBe('/proposals');
  });

  it.each([
    [403, 'contributions_off', "This game isn't taking proposals right now."],
    [403, 'own_game', 'This is your own game — change it in Studio instead.'],
    [403, 'not_published', "This game isn't published right now, so it can't take proposals."],
    [429, 'too_many_open', 'You have a lot of proposals open.'],
    [429, 'rate_limited', "You're sending proposals too quickly."],
    [422, 'content_rejected', "Your proposal didn't pass our content rules."],
    [401, undefined, 'Your session ended. Sign in again to send a proposal.'],
    [500, 'boom', "That didn't send. Try again in a moment."],
  ])('explains a %i %s refusal', async (status, code, message) => {
    submit = { status, body: code ? { error: code } : {} };
    await draw();
    await open();
    fill('Double jump', DESCRIPTION);
    await send();
    expect(container.querySelector('.propose-error')?.textContent).toContain(message);
    expect(submitButton().disabled).toBe(false);
  });
});

describe('proposeErrorKey', () => {
  it('has a Polish sentence for every refusal', async () => {
    await i18n.changeLanguage('pl');
    const codes = ['contributions_off', 'own_game', 'not_published', 'too_many_open', 'rate_limited'];
    for (const code of [...codes, 'content_rejected']) {
      const key = proposeErrorKey({ status: 403, code });
      expect(key).toBe(`propose.errors.${code}`);
      expect(i18n.exists(key)).toBe(true);
    }
    expect(i18n.t(proposeErrorKey({ status: 401 }))).toContain('Zaloguj się');
  });
});
