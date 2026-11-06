// Self-declared crawlers and headless browsers. `cu` excludes CUBOT phones.
const BOT_USER_AGENT =
  /(?<!cu)bot\b|crawl|spider|slurp|headlesschrome|lighthouse|phantomjs|facebookexternalhit|bytespider|python-|curl\/|wget\/|go-http-client|node-fetch|axios\//i;

// A missing header stays countable: test clients and odd proxies omit it.
export function isBotUserAgent(userAgent: string | string[] | undefined): boolean {
  const value = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  return typeof value === 'string' && BOT_USER_AGENT.test(value);
}
