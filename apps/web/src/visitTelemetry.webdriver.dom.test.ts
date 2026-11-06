// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { startVisitTracking } from './visitTelemetry.js';

afterEach(() => {
  Object.defineProperty(window.navigator, 'webdriver', { value: false, configurable: true });
  window.sessionStorage.clear();
});

it('records nothing in an automated browser', () => {
  Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true });
  const batches: unknown[] = [];
  const teardown = startVisitTracking({ send: (body) => void batches.push(body) });
  teardown();
  expect(batches).toEqual([]);
});
