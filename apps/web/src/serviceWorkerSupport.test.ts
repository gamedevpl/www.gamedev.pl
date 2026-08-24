// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { hasServiceWorkerSupport } from './serviceWorkerSupport.js';

describe('hasServiceWorkerSupport', () => {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');

  afterEach(() => {
    if (original) Object.defineProperty(Navigator.prototype, 'serviceWorker', original);
  });

  it('returns false instead of throwing when the property access itself throws', () => {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', {
      configurable: true,
      get() {
        throw new DOMException('Service worker is disabled', 'SecurityError');
      },
    });

    expect(() => hasServiceWorkerSupport()).not.toThrow();
    expect(hasServiceWorkerSupport()).toBe(false);
  });

  it('does not throw under normal (non-poisoned) conditions', () => {
    expect(() => hasServiceWorkerSupport()).not.toThrow();
    expect(typeof hasServiceWorkerSupport()).toBe('boolean');
  });
});
