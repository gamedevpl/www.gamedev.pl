import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { installMarkPath, noteInstallChannel, platformOs, takeInstallReport } from './install-mark.js';

function home(): NodeJS.ProcessEnv {
  return { HOME: mkdtempSync(join(tmpdir(), 'gdpl-install-')) };
}

describe('install reporting', () => {
  it('reports one install per version, from a terminal, then stays quiet', () => {
    const env = home();
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'darwin' })).toEqual({ os: 'darwin' });
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'darwin' })).toBeNull();
    expect(takeInstallReport({ env, isTty: true, version: '0.7.0', platform: 'darwin' })).toEqual({ os: 'darwin' });
  });

  // A CI container is a fresh HOME per job, not an install.
  it('says nothing off a terminal, and does not spend the report either', () => {
    const env = home();
    expect(takeInstallReport({ env, isTty: false, version: '0.6.0', platform: 'linux' })).toBeNull();
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'linux' })).toEqual({ os: 'linux' });
  });

  it('carries the channel an update left behind, once', () => {
    const env = home();
    noteInstallChannel(env, 'update');
    expect(takeInstallReport({ env, isTty: true, version: '0.7.0', platform: 'win32' })).toEqual({
      channel: 'update',
      os: 'win32',
    });
    expect(takeInstallReport({ env, isTty: true, version: '0.8.0', platform: 'win32' })).toEqual({ os: 'win32' });
  });

  it('omits an OS it cannot name, and survives a corrupt or unwritable mark', () => {
    const env = home();
    expect(platformOs('freebsd')).toBeUndefined();
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'freebsd' })).toEqual({});
    const other = home();
    mkdirSync(join(other.HOME!, '.config', 'gamedevpl'), { recursive: true });
    writeFileSync(installMarkPath(other), 'not json');
    expect(takeInstallReport({ env: other, isTty: true, version: '0.6.0', platform: 'linux' })).toEqual({
      os: 'linux',
    });
    expect(JSON.parse(readFileSync(installMarkPath(other), 'utf8'))).toEqual({ reported: '0.6.0' });
  });

  // An install that cannot be marked would report again on every run.
  it('reports nothing when the mark cannot be written', () => {
    const blocked = join(mkdtempSync(join(tmpdir(), 'gdpl-install-')), 'home');
    writeFileSync(blocked, '');
    const env = { HOME: blocked };
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'linux' })).toBeNull();
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'linux' })).toBeNull();
  });

  // A rejected event loses the install for good.
  it('drops a channel the shared enum does not name', () => {
    const env = home();
    mkdirSync(join(env.HOME!, '.config', 'gamedevpl'), { recursive: true });
    writeFileSync(installMarkPath(env), JSON.stringify({ channel: '/home/private/curl', reported: 7 }));
    expect(takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'linux' })).toEqual({ os: 'linux' });
  });

  it('keeps nothing that could identify the machine', () => {
    const env = home();
    noteInstallChannel(env, 'curl');
    takeInstallReport({ env, isTty: true, version: '0.6.0', platform: 'linux' });
    const written = readFileSync(installMarkPath(env), 'utf8');
    expect(written).not.toContain(env.HOME);
    expect(Object.keys(JSON.parse(written))).toEqual(['reported']);
  });
});
