import { expect, it } from 'vitest';
import { betaInvitePath, parsePathRoute } from './router.js';

it('keeps an invite credential out of the request target', () => {
  const code = 'Abc123_-'.repeat(4);
  const url = new URL(betaInvitePath(code), 'https://www.gamedev.pl');
  expect(url.pathname + url.search).toBe('/invite');
  expect(parsePathRoute(url.pathname, url.hash)).toEqual({ view: 'invite', code });
  expect(parsePathRoute(`/invite/${code}`)).toEqual({ view: 'invite', code });
});
