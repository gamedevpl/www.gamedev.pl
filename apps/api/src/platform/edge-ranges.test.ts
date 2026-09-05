import { afterEach, describe, expect, it } from 'vitest';
import { edgeRangesFetchedAt, isGoogleOwnAddress, refreshEdgeRanges, resetEdgeRangesForTests } from './edge-ranges.js';

afterEach(() => resetEdgeRangesForTests());

function fakeFetch(google: string[], customer: string[]): typeof fetch {
  const body = (prefixes: string[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ prefixes: prefixes.map((p) => (p.includes(':') ? { ipv6Prefix: p } : { ipv4Prefix: p })) }),
  });
  return (async (url: string | URL | Request) =>
    body(String(url).includes('goog.json') ? google : customer)) as unknown as typeof fetch;
}

describe('isGoogleOwnAddress, on the bundled snapshot', () => {
  it('admits the peers Hosting was measured to append', () => {
    expect(isGoogleOwnAddress('66.102.8.69')).toBe(true);
    expect(isGoogleOwnAddress('66.102.8.201')).toBe(true);
  });

  it('refuses what is not a caller at all', () => {
    for (const value of ['0.0.0.0', '', 'not-an-ip', '203.0.113.7']) {
      expect(isGoogleOwnAddress(value)).toBe(false);
    }
  });

  it('reads an IPv4-mapped IPv6 peer as its IPv4 self', () => {
    expect(isGoogleOwnAddress('::ffff:66.102.8.69')).toBe(true);
  });
});

describe('the subtraction happens per address, not per prefix string', () => {
  it('refuses a customer VM inside a parent range Google owns', async () => {
    // Google's /14 with a customer /16 inside it.
    await refreshEdgeRanges(fakeFetch(['104.196.0.0/14'], ['104.196.0.0/16']));
    expect(isGoogleOwnAddress('104.196.5.5')).toBe(false);
    expect(isGoogleOwnAddress('104.199.1.1')).toBe(true);
  });
});

describe('refreshEdgeRanges', () => {
  it('swaps in fresh lists when both arrive', async () => {
    expect(await refreshEdgeRanges(fakeFetch(['198.51.100.0/24'], ['192.0.2.0/24']))).toBe(true);
    expect(isGoogleOwnAddress('198.51.100.7')).toBe(true);
    expect(isGoogleOwnAddress('66.102.8.69')).toBe(false);
  });

  it('keeps what it has when a fetch fails', async () => {
    const before = edgeRangesFetchedAt();
    const failing = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await refreshEdgeRanges(failing)).toBe(false);
    expect(isGoogleOwnAddress('66.102.8.69')).toBe(true);
    expect(edgeRangesFetchedAt()).toBe(before);
  });

  it('keeps what it has when a list comes back empty', async () => {
    expect(await refreshEdgeRanges(fakeFetch([], ['192.0.2.0/24']))).toBe(false);
    expect(isGoogleOwnAddress('66.102.8.69')).toBe(true);
  });
});
