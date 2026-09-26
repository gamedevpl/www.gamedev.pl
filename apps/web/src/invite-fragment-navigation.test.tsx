// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./AuthContext.js', () => ({ useAuth: () => ({ user: null, loading: false, privateBeta: true }) }));
vi.mock('./ClosedBetaSplash.js', () => ({
  ClosedBetaSplash: ({ inviteCode }: { inviteCode?: string }) => <div>{inviteCode ?? 'home'}</div>,
}));
vi.mock('./App.js', () => ({ App: () => <div>app</div> }));
import { BootGate } from './BootGate.js';

it.each(['hashchange', 'popstate'])('updates the signed-out invite after %s', async (event) => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const first = 'A'.repeat(32);
  const next = 'B'.repeat(32);
  window.history.replaceState({}, '', `/invite#${first}`);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<BootGate />);
    });
    expect(container.textContent).toBe(first);
    await act(async () => {
      window.history.pushState({}, '', `/invite#${next}`);
      window.dispatchEvent(new Event(event));
    });
    expect(container.textContent).toBe(next);
    await act(async () => {
      window.history.replaceState({}, '', `/invite#${first}`);
      window.dispatchEvent(new Event('popstate'));
    });
    expect(container.textContent).toBe(first);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
