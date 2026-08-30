// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  readStorageItem,
  readStorageJSON,
  removeStorageItem,
  resolveWebStorage,
  writeStorageItem,
  writeStorageJSON,
} from './persistence.js';

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    clear: () => {},
    key: () => null,
    length: 0,
  };
}

describe('readStorageItem / writeStorageItem / removeStorageItem', () => {
  afterEach(() => {
    window.localStorage.removeItem('gdpl.persistence-test');
  });

  it('round-trips through the given storage', () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    };
    writeStorageItem('k', 'v', fakeStorage);
    expect(readStorageItem('k', fakeStorage)).toBe('v');
    removeStorageItem('k', fakeStorage);
    expect(readStorageItem('k', fakeStorage)).toBeNull();
  });

  it('degrades to null / no-op when storage throws', () => {
    const storage = throwingStorage();
    expect(readStorageItem('k', storage)).toBeNull();
    expect(() => writeStorageItem('k', 'v', storage)).not.toThrow();
    expect(() => removeStorageItem('k', storage)).not.toThrow();
  });

  it('defaults to window.localStorage', () => {
    writeStorageItem('gdpl.persistence-test', 'v');
    expect(window.localStorage.getItem('gdpl.persistence-test')).toBe('v');
    expect(readStorageItem('gdpl.persistence-test')).toBe('v');
    removeStorageItem('gdpl.persistence-test');
    expect(window.localStorage.getItem('gdpl.persistence-test')).toBeNull();
  });
});

describe('readStorageJSON / writeStorageJSON', () => {
  it('round-trips structured data', () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    };
    writeStorageJSON('k', { a: 1, b: ['x'] }, fakeStorage);
    expect(readStorageJSON<{ a: number; b: string[] }>('k', fakeStorage)).toEqual({ a: 1, b: ['x'] });
  });

  it('returns null for a missing key or malformed JSON', () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    };
    expect(readStorageJSON('missing', fakeStorage)).toBeNull();
    fakeStorage.setItem('bad', '{not json');
    expect(readStorageJSON('bad', fakeStorage)).toBeNull();
  });

  it('degrades to a no-op when the value cannot be serialized', () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    };
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => writeStorageJSON('k', circular, fakeStorage)).not.toThrow();
    expect(fakeStorage.getItem('k')).toBeNull();
  });
});

describe('resolveWebStorage', () => {
  it('returns the requested Storage object', () => {
    expect(resolveWebStorage('local')).toBe(window.localStorage);
    expect(resolveWebStorage('session')).toBe(window.sessionStorage);
  });
});
