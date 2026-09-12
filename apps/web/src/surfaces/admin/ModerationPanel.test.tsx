// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModerationPanel } from './ModerationPanel.js';

const mocked = vi.hoisted(() => ({
  fetchModerationFlags: vi.fn(),
  resolveModerationFlag: vi.fn(),
}));

vi.mock('./moderationApi.js', () => mocked);

const flag = {
  id: 'sky-dodge:dev:reviewer',
  slug: 'sky-dodge',
  source: 'catalog' as const,
  reason: 'hate',
  note: 'A slur is painted on the title screen.',
  raisedByUid: 'dev:reviewer',
  createdAt: '2026-09-12T08:00:00.000Z',
  status: 'open' as const,
  action: null,
  resolvedAt: null,
  resolvedByUid: null,
  resolutionNote: null,
};

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(ModerationPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ModerationPanel', () => {
  it('shows an open report with what the reviewer actually wrote', async () => {
    mocked.fetchModerationFlags.mockResolvedValue([flag]);
    const { container } = await render();

    expect(mocked.fetchModerationFlags).toHaveBeenCalledWith('open');
    expect(container.textContent).toContain('sky-dodge');
    expect(container.textContent).toContain('Hate or slurs');
    expect(container.textContent).toContain('A slur is painted on the title screen.');
  });

  it('takes a game down and reports what the takedown reached', async () => {
    mocked.fetchModerationFlags.mockResolvedValue([flag]);
    mocked.resolveModerationFlag.mockResolvedValue({
      blocked: true,
      unshared: true,
      unpublished: true,
      stillPublic: false,
    });
    const { container } = await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.admin-moderation-takedown')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.resolveModerationFlag).toHaveBeenCalledWith('sky-dodge:dev:reviewer', 'taken_down', undefined);
    expect(container.textContent).toContain('unpublished');
    expect(container.textContent).toContain('blocked re-sharing');
  });

  it('says plainly when the game is still up and the kill switch is elsewhere', async () => {
    // Repo-lane games keep serving; silence would read as done.
    mocked.fetchModerationFlags.mockResolvedValue([flag]);
    mocked.resolveModerationFlag.mockResolvedValue({
      blocked: true,
      unshared: false,
      unpublished: false,
      stillPublic: true,
    });
    const { container } = await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.admin-moderation-takedown')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('still published from the games repo');
  });

  it('surfaces a refused resolve instead of pretending it worked', async () => {
    mocked.fetchModerationFlags.mockResolvedValue([flag]);
    mocked.resolveModerationFlag.mockRejectedValue(new Error('already_resolved'));
    const { container } = await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.admin-moderation-dismiss')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('already_resolved');
  });
});
