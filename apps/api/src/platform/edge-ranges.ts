import { BlockList, isIP } from 'node:net';
import snapshot from './edge-ranges.json' with { type: 'json' };

const GOOGLE_RANGES_URL = 'https://www.gstatic.com/ipranges/goog.json';
const CUSTOMER_RANGES_URL = 'https://www.gstatic.com/ipranges/cloud.json';

interface EdgeRanges {
  google: BlockList;
  customer: BlockList;
  fetchedAt: string;
}

type Family = 'ipv4' | 'ipv6';

function familyOf(address: string): Family | null {
  const version = isIP(address);
  return version === 4 ? 'ipv4' : version === 6 ? 'ipv6' : null;
}

function blockList(prefixes: string[]): BlockList {
  const list = new BlockList();
  for (const prefix of prefixes) {
    const [address, bits] = prefix.split('/');
    const family = address ? familyOf(address) : null;
    if (!family || !bits) continue;
    list.addSubnet(address, Number(bits), family);
  }
  return list;
}

function fromLists(google: string[], customer: string[], fetchedAt: string): EdgeRanges {
  return { google: blockList(google), customer: blockList(customer), fetchedAt };
}

let current = fromLists(snapshot.google, snapshot.customer, snapshot.fetchedAt);

// Google's own services: in goog.json, not in cloud.json.
export function isGoogleOwnAddress(address: string): boolean {
  const family = familyOf(address);
  if (!family) return false;
  return current.google.check(address, family) && !current.customer.check(address, family);
}

export function edgeRangesFetchedAt(): string {
  return current.fetchedAt;
}

async function fetchPrefixes(url: string, fetchImpl: typeof fetch): Promise<string[]> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body = (await response.json()) as { prefixes?: { ipv4Prefix?: string; ipv6Prefix?: string }[] };
  return (body.prefixes ?? []).map((entry) => entry.ipv4Prefix ?? entry.ipv6Prefix).filter((p): p is string => !!p);
}

// Swaps only when both lists arrive; a failure keeps what is loaded.
export async function refreshEdgeRanges(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const [google, customer] = await Promise.all([
      fetchPrefixes(GOOGLE_RANGES_URL, fetchImpl),
      fetchPrefixes(CUSTOMER_RANGES_URL, fetchImpl),
    ]);
    if (google.length === 0 || customer.length === 0) return false;
    current = fromLists(google, customer, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function resetEdgeRangesForTests(): void {
  current = fromLists(snapshot.google, snapshot.customer, snapshot.fetchedAt);
}

interface Logger {
  warn: (context: object, message: string) => void;
}

// Background only; the timer must never hold the process open.
export function startEdgeRangeRefresh(log: Logger, intervalMs = 6 * 60 * 60 * 1000): () => void {
  const tick = async () => {
    if (!(await refreshEdgeRanges())) log.warn({ fetchedAt: current.fetchedAt }, 'edge ranges refresh failed');
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
