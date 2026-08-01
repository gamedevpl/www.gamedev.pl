// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuilderChoice } from './BuilderChoice.js';
import type { BuilderKind } from './builderKind.js';
import i18n from './i18n/index.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('BuilderChoice', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('defaults visually to the selected builder and reports changes', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let value: BuilderKind = 'platform';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const render = () =>
      act(async () => {
        root.render(
          createElement(BuilderChoice, {
            value,
            onChange: (next: BuilderKind) => {
              value = next;
            },
          }),
        );
        await flush();
      });

    await render();

    const options = container.querySelectorAll<HTMLButtonElement>('.builder-choice-option');
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options[0].textContent).toContain('Our AI dev team');
    expect(options[1].textContent).toContain('My own coding agent');

    await act(async () => {
      options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(value).toBe('self');

    await render();
    expect(container.querySelectorAll('.builder-choice-option')[1].getAttribute('aria-checked')).toBe('true');

    await act(async () => root.unmount());
  });

  it('renders Polish labels without the word token', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('pl');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BuilderChoice, { value: 'platform', onChange: () => undefined }));
      await flush();
    });

    const text = container.textContent ?? '';
    expect(text).toMatch(/Nasz zespół AI|Mój własny agent/);
    expect(text.toLowerCase()).not.toMatch(/\btoken\b/);

    await act(async () => root.unmount());
    await i18n.changeLanguage('en');
  });
});
