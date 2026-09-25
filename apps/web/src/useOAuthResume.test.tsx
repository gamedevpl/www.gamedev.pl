// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateToOAuthReturn } from './oauthRedirect.js';
import { useOAuthResume, type OAuthResumeUser } from './useOAuthResume.js';

vi.mock('./oauthRedirect.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./oauthRedirect.js')>()),
  navigateToOAuthReturn: vi.fn(),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Probe(props: { user: OAuthResumeUser | null; openSignIn: (open: boolean) => void }) {
  const refused = useOAuthResume(false, props.user, props.openSignIn);
  return createElement('p', null, refused ? 'refused' : 'idle');
}

async function renderProbe(user: OAuthResumeUser | null, openSignIn = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Probe, { user, openSignIn }));
  });
  return { text: container.textContent, openSignIn };
}

describe('useOAuthResume', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/studio?oauth_return=%2Foauth%2Fauthorize%3Fclient_id%3Dabc');
    vi.mocked(navigateToOAuthReturn).mockClear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = undefined;
  });

  it('resumes the authorize URL for a Google or Apple session', async () => {
    const { text } = await renderProbe({ uid: 'g:a', tier: 'standard' });
    expect(text).toBe('idle');
    expect(navigateToOAuthReturn).toHaveBeenCalledWith('/oauth/authorize?client_id=abc', window.location);
  });

  it('stops a token session instead of looping back to authorize', async () => {
    const { text } = await renderProbe({ uid: 'g:a', tier: 'standard', tokenSession: true });
    expect(text).toBe('refused');
    expect(navigateToOAuthReturn).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/studio');
  });

  it('opens sign-in when nobody is signed in', async () => {
    const { openSignIn } = await renderProbe(null);
    expect(openSignIn).toHaveBeenCalledWith(true);
    expect(navigateToOAuthReturn).not.toHaveBeenCalled();
  });
});
