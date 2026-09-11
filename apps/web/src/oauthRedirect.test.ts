import { describe, expect, it, vi } from 'vitest';
import { navigateToOAuthReturn } from './oauthRedirect.js';

describe('navigateToOAuthReturn', () => {
  it('navigates only to an approved same-origin OAuth route', () => {
    const location = { origin: 'https://www.gamedev.pl', replace: vi.fn() };

    navigateToOAuthReturn('/oauth/authorize?client_id=abc', location);
    navigateToOAuthReturn('https://evil.test/oauth/authorize', location);
    navigateToOAuthReturn('/admin', location);

    expect(location.replace).toHaveBeenCalledOnce();
    expect(location.replace).toHaveBeenCalledWith('/oauth/authorize?client_id=abc');
  });
});
