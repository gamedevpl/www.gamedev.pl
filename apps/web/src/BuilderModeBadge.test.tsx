// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuilderModeBadge } from './BuilderModeBadge.js';
import type { BuilderKind } from './builderKind.js';
import i18n from './i18n/index.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('BuilderModeBadge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the sticky self label and opens the choice modal on Change', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let value: BuilderKind = 'self';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const render = () =>
      act(async () => {
        root.render(
          createElement(BuilderModeBadge, {
            value,
            onChange: (next: BuilderKind) => {
              value = next;
            },
            canChange: true,
          }),
        );
        await flush();
      });

    await render();

    expect(container.querySelector('.builder-mode-badge')?.textContent).toContain('Your agent (MCP)');
    expect(container.querySelector('.builder-choice')).toBeNull();
    expect(document.body.querySelector('.builder-choice-modal')).toBeNull();

    await act(async () => {
      container.querySelector('.builder-mode-badge-change')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const modal = document.body.querySelector('.builder-choice-modal');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toMatch(/Who builds this round/i);
    const options = modal!.querySelectorAll<HTMLButtonElement>('.builder-choice-option');
    expect(options).toHaveLength(2);

    await act(async () => {
      options[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(value).toBe('platform');

    await render();
    expect(container.querySelector('.builder-mode-badge')?.textContent).toContain('Gamedev.pl agent');

    await act(async () => root.unmount());
  });

  it('hides Change while an agent is working', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(BuilderModeBadge, {
          value: 'self',
          onChange: () => undefined,
          canChange: false,
        }),
      );
      await flush();
    });

    expect(container.querySelector('.builder-mode-badge')?.textContent).toContain('Your agent (MCP)');
    expect(container.querySelector('.builder-mode-badge-change')).toBeNull();

    await act(async () => root.unmount());
  });
});
