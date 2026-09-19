// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptionImage } from './optionImagesApi.js';
import { CreatorQA } from './CreatorQA.js';
import i18n from './i18n/index.js';

const { fetchOptionImages } = vi.hoisted(() => ({
  fetchOptionImages: vi.fn<(input: { question: string }) => Promise<OptionImage[]>>(),
}));

vi.mock('./optionImagesApi.js', () => ({ fetchOptionImages }));

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const tiles = () => document.querySelectorAll<HTMLImageElement>('img.qa-option__art');

async function renderAtQuestion(question: Record<string, unknown>) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    questions: [question],
    initialConcept: 'Dodge the falling rocks and survive as long as possible',
    initialTitle: 'Rock Dodger',
    onSubmitWithConcept: () => undefined,
  };
  await act(async () => {
    root.render(createElement(CreatorQA, props as never));
    await flushEffects();
  });
  // Step off the name stage onto the question itself.
  await act(async () => {
    document.querySelector('.qa-next')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushEffects();
  });
  return root;
}

const VISUAL_QUESTION = {
  id: 'visual_style',
  question: 'What visual style fits best?',
  options: [{ label: 'Pixel Art' }, { label: 'Neon Arcade' }, { label: 'Flat 2D' }],
  visual: true,
};

describe('CreatorQA option images', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    fetchOptionImages.mockReset();
  });

  it('illustrates a visual question once every option has a tile', async () => {
    fetchOptionImages.mockResolvedValue([
      { label: 'Pixel Art', image: 'data:image/webp;base64,AAA' },
      { label: 'Neon Arcade', image: 'data:image/webp;base64,BBB' },
      { label: 'Flat 2D', image: 'data:image/webp;base64,CCC' },
    ]);

    await renderAtQuestion(VISUAL_QUESTION);

    expect(document.querySelector('.qa-options--art')).not.toBeNull();
    expect(tiles()).toHaveLength(3);
    // Decorative: the label beside it is what a screen reader reads.
    expect(tiles()[0]?.getAttribute('alt')).toBe('');
  });

  it('shows no tiles at all when only some options came back', async () => {
    fetchOptionImages.mockResolvedValue([{ label: 'Pixel Art', image: 'data:image/webp;base64,AAA' }]);

    await renderAtQuestion(VISUAL_QUESTION);

    // An illustrated subset would read as a recommendation.
    expect(document.querySelector('.qa-options--art')).toBeNull();
    expect(tiles()).toHaveLength(0);
    expect(document.querySelectorAll('.qa-option')).toHaveLength(3);
  });

  it('leaves the options plain when the refiner did not mark the question visual', async () => {
    await renderAtQuestion({
      id: 'control_scheme',
      question: 'How does the player move?',
      options: [{ label: 'Keyboard' }, { label: 'Mouse' }],
    });

    expect(fetchOptionImages).not.toHaveBeenCalled();
    expect(tiles()).toHaveLength(0);
  });

  it('asks for tiles as soon as the wizard opens, not on arrival at the question', async () => {
    fetchOptionImages.mockResolvedValue([]);

    await renderAtQuestion(VISUAL_QUESTION);

    expect(fetchOptionImages).toHaveBeenCalledTimes(1);
    expect(fetchOptionImages.mock.calls[0]?.[0]?.question).toBe('What visual style fits best?');
  });
});
