import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { readTarEntries } from './tar.js';
import { sha256 } from './api-kit-compatibility.js';

export async function apiKitStarter(
  tarball: Buffer,
  engineRef: string,
  digest: string,
): Promise<Record<string, string>> {
  if (sha256(tarball) !== digest) throw new Error('Published Kit archive does not match its sidecar');
  const files: Record<string, string> = {};
  const prefix = 'gamedevpl-creator-kit/';
  const stream = Readable.from(tarball).pipe(createGunzip());
  let identity: string | undefined;
  try {
    for await (const entry of readTarEntries(stream, { maxTotalBytes: 256 * 1024 * 1024 })) {
      const name = entry.path.slice(prefix.length);
      if (!entry.path.startsWith(prefix)) continue;
      if (name === 'kit.json') {
        identity = (JSON.parse(Buffer.from(entry.bytes).toString('utf8')) as { engineRef?: string }).engineRef;
      }
      if (name.startsWith('starters/block-cascade/')) files[name] = Buffer.from(entry.bytes).toString('base64');
    }
  } finally {
    stream.destroy();
  }
  if (
    identity !== engineRef ||
    !files['starters/block-cascade/GAME.json'] ||
    !files['starters/block-cascade/game.ts']
  ) {
    throw new Error('Published Kit has no matching identity or starter');
  }
  return files;
}

export function apiKitContainerArgs(image: string, input: string, output: string): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('API verification requires an immutable image');
  return [
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--user=10002:10002',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--security-opt=seccomp=unconfined',
    '--security-opt=apparmor=unconfined',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=536870912,mode=1777',
    '--shm-size=256m',
    '--env=HOME=/tmp',
    '--env=TMPDIR=/tmp',
    ...['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy'].map(
      (name) => `--env=${name}=`,
    ),
    '--mount',
    `type=bind,src=${input},dst=/input,readonly`,
    '--mount',
    `type=bind,src=${output},dst=/result`,
    image,
  ];
}
