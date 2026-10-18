// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

const fetchGameDreams = vi.fn();
const answerDreamsOffer = vi.fn();

vi.mock('../../gameDreamsApi.js', () => ({
  fetchGameDreams,
  answerDreamsOffer,
  onGameDreamsChanged: () => () => {},
}));

const { DreamsOfferCard } = await import('./DreamsOfferCard.js');

async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(<DreamsOfferCard slug="neon" />);
  });
  return container;
}

const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)!;

describe('DreamsOfferCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pl');
    fetchGameDreams.mockReset().mockResolvedValue({ on: true, wanted: false, accountMuted: false });
    answerDreamsOffer.mockReset();
  });

  afterEach(async () => {
    document.body.innerHTML = '';
    await i18n.changeLanguage('en');
  });

  it('a yes asks the builder and says what happens next', async () => {
    answerDreamsOffer.mockResolvedValue({ on: true, wanted: true, accountMuted: false });
    const container = await mount();
    expect(button(container, 'Tak, przygotuj').className).toContain('primary-btn');
    await act(async () => button(container, 'Tak, przygotuj').click());
    expect(answerDreamsOffer).toHaveBeenCalledWith('neon', true);
    expect(container.textContent).toContain('w następnej rundzie builder doda zrzut');
    expect(container.querySelector('button')).toBeNull();
  });

  it('a no turns sketches off and points to the rail', async () => {
    answerDreamsOffer.mockResolvedValue({ on: false, wanted: false, accountMuted: false });
    const container = await mount();
    await act(async () => button(container, 'Nie, dziękuję').click());
    expect(answerDreamsOffer).toHaveBeenCalledWith('neon', false);
    expect(container.textContent).toContain('Przegląd');
  });

  it('shows the settled answer instead of buttons on a later visit', async () => {
    fetchGameDreams.mockResolvedValue({ on: true, wanted: true, accountMuted: false });
    const container = await mount();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('builder doda zrzut');
  });

  it('keeps the buttons and says so when saving fails', async () => {
    answerDreamsOffer.mockRejectedValue(new Error('offline'));
    const container = await mount();
    await act(async () => button(container, 'Tak, przygotuj').click());
    expect(container.textContent).toContain('Nie udało się zapisać odpowiedzi');
    expect(button(container, 'Tak, przygotuj').disabled).toBe(false);
  });

  it('renders nothing for a viewer who does not own the game', async () => {
    fetchGameDreams.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    const container = await mount();
    expect(container.textContent).toBe('');
  });
});
