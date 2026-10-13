import { describe, expect, it } from 'vitest';
import { defaultLoginFlow } from './sign-in.js';

describe('default login flow', () => {
  it('uses loopback on a local desktop', () => {
    expect(defaultLoginFlow({}, 'darwin')).toBe('loopback');
    expect(defaultLoginFlow({}, 'win32')).toBe('loopback');
    expect(defaultLoginFlow({ DISPLAY: ':0' }, 'linux')).toBe('loopback');
  });

  it('uses device flow in Codespaces, SSH, CI and headless Linux', () => {
    expect(defaultLoginFlow({ CODESPACES: 'true' }, 'linux')).toBe('device');
    expect(defaultLoginFlow({ SSH_CONNECTION: '1 2 3 4' }, 'darwin')).toBe('device');
    expect(defaultLoginFlow({ CI: 'true' }, 'darwin')).toBe('device');
    expect(defaultLoginFlow({}, 'linux')).toBe('device');
  });
});
