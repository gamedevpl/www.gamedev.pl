import { lookup as dnsLookup } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

export type CimdFetchFailure =
  | 'bad_url'
  | 'blocked_address'
  | 'dns_failed'
  | 'redirect'
  | 'http_status'
  | 'content_type'
  | 'too_large'
  | 'timeout'
  | 'bad_json';
export type CimdFetchResult = { ok: true; body: unknown } | { ok: false; reason: CimdFetchFailure };
export type CimdFetcher = (url: string) => Promise<CimdFetchResult>;
type LookupAddress = { address: string; family: number };
export type LookupFunction = (
  host: string,
  options: { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const blocked = new BlockList();
const mappedAddresses = new BlockList();
mappedAddresses.addSubnet('::ffff:0:0', 96, 'ipv6');
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

export function isBlockedAddress(address: string, family: 4 | 6): boolean {
  if (family === 4) return isIP(address) !== 4 || blocked.check(address, 'ipv4');
  if (isIP(address) !== 6) return true;
  if (mappedAddresses.check(address, 'ipv6')) {
    const dotted = /ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (dotted) return isBlockedAddress(dotted[1]!, 4);
    const hex = /ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
    if (!hex) return true;
    const high = Number.parseInt(hex[1]!, 16);
    const low = Number.parseInt(hex[2]!, 16);
    return isBlockedAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 4);
  }
  return blocked.check(address, 'ipv6');
}

export function validateCimdUrl(raw: string): URL | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    return null;
  }
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 || url.pathname === '/') return null;
  const rawPath = /^https:\/\/[^/?#]+([^?#]*)/i.exec(raw)?.[1] ?? '';
  try {
    if (rawPath.split('/').some((segment) => ['.', '..'].includes(decodeURIComponent(segment)))) return null;
  } catch {
    return null;
  }
  return url;
}

export function createCimdFetcher(
  options: {
    lookup?: LookupFunction;
    timeoutMs?: number;
    maxBytes?: number;
    ca?: string;
    requestFn?: typeof request;
  } = {},
): CimdFetcher {
  const lookup = options.lookup ?? (dnsLookup as LookupFunction);
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const send = options.requestFn ?? request;
  return async (raw) => {
    const url = validateCimdUrl(raw);
    if (!url) return { ok: false, reason: 'bad_url' };
    return new Promise<CimdFetchResult>((resolve) => {
      let settled = false;
      let failure: CimdFetchFailure = 'dns_failed';
      const finish = (result: CimdFetchResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const req = send(
        url,
        {
          headers: { accept: 'application/json', 'user-agent': 'gamedev.pl-oauth/1' },
          ca: options.ca,
          lookup(host, _lookupOptions, callback) {
            lookup(host, { all: true }, (error, addresses) => {
              if (error || !addresses?.length) {
                failure = 'dns_failed';
                callback(error ?? new Error('DNS returned no addresses'), '', 4);
                return;
              }
              if (addresses.some(({ address, family }) => isBlockedAddress(address, family as 4 | 6))) {
                failure = 'blocked_address';
                callback(new Error('blocked_address'), '', 4);
                return;
              }
              const first = addresses[0]!;
              callback(null, first.address, first.family);
            });
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            finish({ ok: false, reason: 'redirect' });
            response.destroy();
            return;
          }
          if (status !== 200) {
            finish({ ok: false, reason: 'http_status' });
            response.destroy();
            return;
          }
          if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers['content-type'] ?? '')) {
            finish({ ok: false, reason: 'content_type' });
            response.destroy();
            return;
          }
          if (Number(response.headers['content-length']) > maxBytes) {
            finish({ ok: false, reason: 'too_large' });
            response.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              finish({ ok: false, reason: 'too_large' });
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            try {
              finish({ ok: true, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown });
            } catch {
              finish({ ok: false, reason: 'bad_json' });
            }
          });
        },
      );
      const timer = setTimeout(() => {
        failure = 'timeout';
        finish({ ok: false, reason: 'timeout' });
        req.destroy();
      }, timeoutMs);
      req.on('error', () => finish({ ok: false, reason: failure }));
      req.end();
    });
  };
}
