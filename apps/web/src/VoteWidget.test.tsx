// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';

/**
 * The widget's whole job is: show the up-count to anyone, and only let a signed-in
 * caller change it. Signed-out clicks open the sign-in modal rather than looking
 * greyed-out-and-broken. Clicking an already-cast up vote un-votes it, and a vote
 * action never blanks the count that was already on screen.
 */

const authState = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...authState, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const votesApi = vi.hoisted(() => ({
  fetchVotes: vi.fn(),
  castVote: vi.fn(),
  clearVote: vi.fn(),
}));
vi.mock('./votesApi', () => votesApi);

import { VoteWidget } from './VoteWidget';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authState.user = null;
  votesApi.fetchVotes.mockReset();
  votesApi.castVote.mockReset();
  votesApi.clearVote.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<VoteWidget slug="brick-storm" />);
  });
}

function upButton(): HTMLButtonElement {
  return container.querySelector('button')!;
}

describe('VoteWidget', () => {
  it('renders nothing while the initial read is in flight, then shows the up count', async () => {
    votesApi.fetchVotes.mockResolvedValue({ up: 4, down: 1, mine: null });
    await draw();
    expect(container.textContent).toContain('4');
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('shows the real count to a signed-out visitor and opens sign-in on click', async () => {
    authState.user = null;
    votesApi.fetchVotes.mockResolvedValue({ up: 4, down: 1, mine: null });
    await draw();

    const up = upButton();
    // Clickable, not greyed-out — the title explains why a click needs a session.
    expect(up.hasAttribute('disabled')).toBe(false);
    expect(up.title).toMatch(/sign in/i);

    await act(async () => {
      up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(votesApi.castVote).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/sign in to like/i);
  });

  it('a signed-in click casts an up vote and reflects the response', async () => {
    authState.user = { uid: 'g:me' };
    votesApi.fetchVotes.mockResolvedValue({ up: 4, down: 1, mine: null });
    votesApi.castVote.mockResolvedValue({ up: 5, down: 1, mine: 'up' });
    await draw();

    const up = upButton();
    await act(async () => {
      up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(votesApi.castVote).toHaveBeenCalledWith('brick-storm', 'up');
    expect(container.textContent).toContain('5');
    expect(up.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the vote already cast un-votes it rather than re-casting', async () => {
    authState.user = { uid: 'g:me' };
    votesApi.fetchVotes.mockResolvedValue({ up: 5, down: 1, mine: 'up' });
    votesApi.clearVote.mockResolvedValue({ up: 4, down: 1, mine: null });
    await draw();

    const up = upButton();
    expect(up.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(votesApi.clearVote).toHaveBeenCalledWith('brick-storm');
    expect(votesApi.castVote).not.toHaveBeenCalled();
    expect(container.textContent).toContain('4');
  });

  it('leaves the last known count up when a vote click fails', async () => {
    authState.user = { uid: 'g:me' };
    votesApi.fetchVotes.mockResolvedValue({ up: 4, down: 1, mine: null });
    votesApi.castVote.mockRejectedValue(new Error('network error'));
    await draw();

    const up = upButton();
    await act(async () => {
      up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Still the pre-click number, not blanked by the failed request.
    expect(container.textContent).toContain('4');
  });

  it('renders nothing at all when the initial read fails', async () => {
    votesApi.fetchVotes.mockRejectedValue(new Error('network error'));
    await draw();
    expect(container.textContent).toBe('');
  });
});
