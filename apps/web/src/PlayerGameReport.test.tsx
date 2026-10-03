// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const authState = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...authState, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

import { PlayerGameReport } from './PlayerGameReport.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('pl');
  authState.user = null;
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

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<PlayerGameReport slug="brick-storm" title="Brick Storm" />);
  });
}

function reportLabels(): string[] {
  return [...container.querySelectorAll('.report-btn .btn-label, a.report-email')].map((el) => el.textContent ?? '');
}

describe('PlayerGameReport', () => {
  it('shows a single report row to a signed-out player', async () => {
    await draw();
    expect(reportLabels()).toEqual(['Zgłoś grę']);
    expect(container.querySelectorAll('a.report-btn')).toHaveLength(1);
    expect(container.querySelector('.report-widget')).toBeNull();
  });

  it('shows a single report row to a signed-in player, with the email notice inside the form', async () => {
    authState.user = { uid: 'g:me' };
    await draw();
    expect(reportLabels()).toEqual(['Zgłoś grę']);
    expect(container.querySelector('a.report-email')).toBeNull();

    await act(async () => {
      container.querySelector('button.report-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(reportLabels()).toEqual(['Zgłoś grę', 'Zgłoś nielegalne treści']);
    expect(container.querySelector('a.report-email')?.getAttribute('href') ?? '').toMatch(/^mailto:/);
  });
});
