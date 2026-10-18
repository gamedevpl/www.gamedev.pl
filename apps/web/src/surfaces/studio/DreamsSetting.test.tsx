// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

const fetchGameDreams = vi.fn();
const setGameDreams = vi.fn();

vi.mock('../../gameDreamsApi.js', () => ({
  fetchGameDreams,
  setGameDreams,
  onGameDreamsChanged: () => () => {},
}));

const { DreamsSetting } = await import('./DreamsSetting.js');

async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DreamsSetting slug="neon" />);
  });
  return Object.assign(container, { root });
}

const toggle = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('[role="switch"]')!;

describe('DreamsSetting', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pl');
    fetchGameDreams.mockReset();
    setGameDreams.mockReset();
  });

  afterEach(async () => {
    document.body.innerHTML = '';
    await i18n.changeLanguage('en');
  });

  it('turns sketches back on for a game the card switched off', async () => {
    fetchGameDreams.mockResolvedValue({ on: false, accountMuted: false });
    setGameDreams.mockResolvedValue({ on: true, accountMuted: false });
    const container = await mount();
    expect(container.textContent).toContain('Szkice konceptów');
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');

    await act(async () => toggle(container).click());

    expect(setGameDreams).toHaveBeenCalledWith('neon', true);
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
  });

  it('says when the bell keeps them off for the whole account', async () => {
    fetchGameDreams.mockResolvedValue({ on: true, accountMuted: true });
    const container = await mount();
    expect(container.textContent).toContain('wyłączone dla całego konta');
  });

  it('rolls the switch back and says so when saving fails', async () => {
    fetchGameDreams.mockResolvedValue({ on: true, accountMuted: false });
    setGameDreams.mockRejectedValue(new Error('offline'));
    const container = await mount();
    await act(async () => toggle(container).click());
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Nie udało się zapisać');
  });

  it('shows nothing when the setting cannot be read', async () => {
    fetchGameDreams.mockRejectedValue(new Error('offline'));
    const container = await mount();
    expect(container.textContent).toBe('');
  });

  it("hides the old game's switch until the new game's state arrives", async () => {
    fetchGameDreams.mockResolvedValueOnce({ on: false, accountMuted: false });
    const container = await mount();
    let resolve: (value: { on: boolean; accountMuted: boolean }) => void = () => {};
    fetchGameDreams.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    await act(async () => {
      container.root.render(<DreamsSetting slug="other" />);
    });
    expect(container.querySelector('[role="switch"]')).toBeNull();
    await act(async () => resolve({ on: true, accountMuted: false }));
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
  });
});
