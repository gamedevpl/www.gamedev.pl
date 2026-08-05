// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import type { GameBoard as GameBoardData } from './gameBoardApi.js';

const fetchGameBoard = vi.fn();
const assignTaskToAgent = vi.fn();

vi.mock('./gameBoardApi.js', () => ({
  fetchGameBoard: (...args: unknown[]) => fetchGameBoard(...args),
  assignTaskToAgent: (...args: unknown[]) => assignTaskToAgent(...args),
}));

import { GameBoard } from './GameBoard.js';

function boardData(overrides: Partial<GameBoardData> = {}): GameBoardData {
  return {
    open: [],
    building: [
      { title: 'Improve Neon Courier', state: 'building', since: '2026-08-04T10:00:00.000Z', agentOpened: true },
    ],
    review: [{ title: 'Touch controls on phones', state: 'ready_for_review', since: '2026-08-04T12:00:00.000Z' }],
    released: [{ title: 'Neon Courier', state: 'published', since: '2026-08-01T12:00:00.000Z' }],
    openVisibility: 'private',
    viewerIsOwner: false,
    ...overrides,
  };
}

function ownerBoard(): GameBoardData {
  return boardData({
    open: [
      {
        id: 'sug-1',
        taskClass: 'defect',
        priority: 8,
        findings: ['Crashes for 12% of sessions', 'Worst on phones'],
        createdAt: '2026-08-04T01:00:00.000Z',
      },
    ],
    openVisibility: 'owner',
    viewerIsOwner: true,
  });
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  fetchGameBoard.mockReset();
  assignTaskToAgent.mockReset();
  fetchGameBoard.mockResolvedValue(boardData());
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function renderBoard() {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GameBoard, { slug: 'neon-courier' }));
  });
  await act(async () => {
    await fetchGameBoard.mock.results[0]?.value.catch(() => {});
    await Promise.resolve();
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(label));
}

describe('GameBoard', () => {
  it('renders the four columns from live work, and explains the private one', async () => {
    await renderBoard();

    const headings = Array.from(container.querySelectorAll('.game-board-column-heading')).map((h) =>
      h.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(headings).toEqual(['Up for grabs 0', 'Building 1', 'To play 1', 'Released 1']);
    expect(container.textContent).toContain('Improve Neon Courier');
    expect(container.textContent).toContain('Touch controls on phones');
    // A visitor is told the column is private rather than shown an empty box.
    expect(container.textContent).toContain('Open tasks are private');
    // The agent-opened round is bylined as such.
    expect(container.textContent).toContain('agent');
    expect(findButton('Hand to the agent')).toBeUndefined();
  });

  it('shows open tasks to the owner and hands one to the agent', async () => {
    fetchGameBoard.mockResolvedValue(ownerBoard());
    assignTaskToAgent.mockResolvedValue(undefined);
    await renderBoard();

    expect(container.textContent).toContain('Crashes for 12% of sessions');
    expect(container.textContent).toContain('Worst on phones');
    expect(container.textContent).toContain('bug');

    const assign = findButton('Hand to the agent');
    expect(assign).toBeDefined();
    await act(async () => {
      assign!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(assignTaskToAgent).toHaveBeenCalledWith('sug-1');
    // The board re-reads rather than patching: the task moves columns server-side.
    expect(fetchGameBoard).toHaveBeenCalledTimes(2);
  });

  it('surfaces the quota refusal in the creator’s own words', async () => {
    fetchGameBoard.mockResolvedValue(ownerBoard());
    assignTaskToAgent.mockRejectedValue(Object.assign(new Error('quota_exceeded'), { code: 'quota_exceeded' }));
    await renderBoard();

    await act(async () => {
      findButton('Hand to the agent')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Daily improvement limit reached');
  });

  it('reports a failed load instead of rendering empty columns', async () => {
    fetchGameBoard.mockRejectedValue(new Error('boom'));
    await renderBoard();

    expect(container.textContent).toContain('Could not load the board');
    expect(container.querySelector('.game-board-columns')).toBeNull();
  });
});
