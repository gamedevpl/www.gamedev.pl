import { describe, expect, it } from 'vitest';
import { isBotUserAgent } from './bot-agent.js';

describe('isBotUserAgent', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1 Safari/605.1.15 (Applebot/0.1)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'curl/8.4.0',
    'python-requests/2.31.0',
  ])('flags %s', (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ])('keeps %s', (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(false);
  });

  it('keeps a request with no user agent', () => {
    expect(isBotUserAgent(undefined)).toBe(false);
  });
});
