import { createConnection } from 'node:net';
import { expect, it, vi } from 'vitest';
import { captureBrowser } from './local-capture-browser.js';

const fixture = vi.hoisted(() => ({
  stage: 'create',
  profile: '',
  policies: [] as Array<{ flags: string[]; close: () => Promise<void> }>,
}));

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    existsSync: () => true,
    mkdtempSync: (prefix: string) => {
      if (fixture.stage === 'create') throw new Error('profile setup fixture failure');
      fixture.profile = fs.mkdtempSync(prefix);
      return fixture.profile;
    },
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      if (fixture.stage === 'preferences' && String(args[0]).endsWith('Preferences'))
        throw new Error('profile setup fixture failure');
      return fs.writeFileSync(...args);
    },
  };
});

vi.mock('./capture-network-policy.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./capture-network-policy.js')>();
  return {
    captureNetworkPolicy: async (url: string) => {
      const policy = await original.captureNetworkPolicy(url);
      vi.spyOn(policy, 'close');
      fixture.policies.push(policy);
      return policy;
    },
  };
});

it.each(['create', 'preferences'])('releases capture resources when profile %s fails', async (stage) => {
  fixture.stage = stage;
  fixture.profile = '';
  fixture.policies.length = 0;
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  try {
    await expect(
      captureBrowser({ url: 'http://127.0.0.1:1/', viewport: 'desktop', signal: new AbortController().signal }),
    ).rejects.toThrow('profile setup fixture failure');
    const policy = fixture.policies[0]!;
    expect(policy.close).toHaveBeenCalledOnce();
    const proxy = new URL(policy.flags[0]!.slice('--proxy-server='.length));
    await expect(
      new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: proxy.hostname, port: Number(proxy.port) });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', reject);
      }),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    if (fixture.profile) expect(fs.existsSync(fixture.profile)).toBe(false);
  } finally {
    await Promise.all(fixture.policies.map((policy) => policy.close()));
    if (fixture.profile) fs.rmSync(fixture.profile, { recursive: true, force: true });
  }
});
