import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { cliSurfaceEnabled } from './cli-surface.js';
import { isKnownSpaShellPath } from './spa-paths.js';
import { InMemoryStore } from './store.js';

describe('cliSurfaceEnabled', () => {
  it('is off unless the deploy flag says exactly true', () => {
    expect(cliSurfaceEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(cliSurfaceEnabled({ CLI_SURFACE: '1' } as NodeJS.ProcessEnv)).toBe(false);
    expect(cliSurfaceEnabled({ CLI_SURFACE: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(cliSurfaceEnabled({ CLI_SURFACE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('treats cli as a reserved handle', async () => {
    const { isReservedHandle, validateHandleShape } = await import('./creator-profile.js');
    expect(isReservedHandle('cli')).toBe(true);
    expect(isReservedHandle('connect')).toBe(true);
    expect(isReservedHandle('mcp')).toBe(true);
    expect(isReservedHandle('device')).toBe(true);
    expect(validateHandleShape('CLI')).toBe('reserved');
  });
});

describe('reserved installer routes', () => {
  it('does not treat /cli as a known SPA shell path', () => {
    expect(isKnownSpaShellPath('/cli')).toBe(false);
    expect(isKnownSpaShellPath('/creators/cli')).toBe(false);
    expect(isKnownSpaShellPath('/gamedevpl')).toBe(true);
    expect(isKnownSpaShellPath('/creators/gamedevpl')).toBe(true);
  });

  it('404s /install.sh, /install.ps1 and /cli as JSON, not the SPA shell', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    for (const url of ['/install.sh', '/install.ps1', '/cli']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.json()).toEqual({ error: 'not found' });
    }
  });

  it('serves checksum-verifying installers and /cli when the flag is on', async () => {
    const prev = process.env.CLI_SURFACE;
    process.env.CLI_SURFACE = 'true';
    try {
      const app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
      const sh = await app.inject({ method: 'GET', url: '/install.sh' });
      expect(sh.statusCode).toBe(200);
      expect(sh.body).toContain('sha256sum');
      expect(sh.body).toContain('shasum -a 256');
      expect(sh.body).toContain('GitHub Releases');
      expect(sh.body).toContain('$HOME/.local/bin');
      expect(sh.body).toContain('Node 20');
      expect(sh.body).toContain('asset="gamedevpl"');
      expect(sh.body).toContain('git-remote-gamedevpl');
      expect(sh.body).toContain('gamedevpl.XXXXXX');
      expect(sh.body).not.toContain('gamedev-linux');
      const page = await app.inject({ method: 'GET', url: '/cli' });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('gamedevpl login');
      expect(page.body).toContain('no token to copy');
      expect(page.body).toContain('encrypted file');
      expect(page.body).toContain('Node 20');
      const ps1 = await app.inject({ method: 'GET', url: '/install.ps1' });
      expect(ps1.statusCode).toBe(200);
      expect(ps1.body).toContain('Get-FileHash');
      expect(ps1.body).toContain('Node 20');
      expect(ps1.body).toContain("process.versions.node.split('.')[0]");
      expect(ps1.body).toContain('too old');
      expect(ps1.body).toContain('node "%~dp0git-remote-gamedevpl" %*');
      expect(sh.body).not.toContain('ORIGIN=');
      const enabled = await app.inject({ method: 'GET', url: '/api/cli/enabled' });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json()).toMatchObject({ enabled: true });
    } finally {
      if (prev === undefined) delete process.env.CLI_SURFACE;
      else process.env.CLI_SURFACE = prev;
    }
  });
});
