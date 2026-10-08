import { describe, expect, it } from 'vitest';
import { creatorHandleFromPath, isPrivateWorkspacePath } from './spa-path-kinds.js';

describe('creatorHandleFromPath', () => {
  it('reads the handle from both profile shapes', () => {
    expect(creatorHandleFromPath('/alice_dev')).toBe('alice_dev');
    expect(creatorHandleFromPath('/creators/alice_dev/')).toBe('alice_dev');
  });

  it('skips the platform, reserved words and other paths', () => {
    expect(creatorHandleFromPath('/gamedevpl')).toBeNull();
    expect(creatorHandleFromPath('/privacy')).toBeNull();
    expect(creatorHandleFromPath('/play/alice')).toBeNull();
    expect(creatorHandleFromPath('/alice/some-game')).toBeNull();
  });
});

describe('isPrivateWorkspacePath', () => {
  it('covers the studio and legacy status links only', () => {
    expect(isPrivateWorkspacePath('/studio')).toBe(true);
    expect(isPrivateWorkspacePath('/studio/abc/build')).toBe(true);
    expect(isPrivateWorkspacePath('/status/abc')).toBe(true);
    expect(isPrivateWorkspacePath('/play/abc')).toBe(false);
    expect(isPrivateWorkspacePath('/alice')).toBe(false);
  });
});
