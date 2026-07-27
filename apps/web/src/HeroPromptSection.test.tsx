// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPromptSection } from './HeroPromptSection.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('HeroPromptSection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders prompt inputs and voice, upload, sketch buttons', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: '',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          mockStatus: 'idle',
          mockError: null,
          onGenerateMock: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const textarea = container.querySelector('.big-prompt-input');
    expect(textarea).not.toBeNull();

    const micBtn = container.querySelector('.mic-btn');
    const uploadBtn = container.querySelector('.upload-btn');
    const sketchBtn = container.querySelector('.sketch-btn');

    expect(micBtn).not.toBeNull();
    expect(uploadBtn).not.toBeNull();
    expect(sketchBtn).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('says it is analyzing while the refiner runs, and submitting only once it is', async () => {
    // The refiner takes a few seconds before anything is sent; claiming "Submitting…"
    // through it described a request that had not been made yet.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderWithStatus = async (submissionStatus: 'idle' | 'refining' | 'loading') => {
      await act(async () => {
        root.render(
          createElement(HeroPromptSection, {
            initialPrompt: 'a game about a space postman',
            catalogEntries: [],
            submissionStatus,
            submissionError: null,
            onSubmitSpec: vi.fn(),
            mockStatus: 'idle',
            mockError: null,
            onGenerateMock: vi.fn(),
          }),
        );
        await flushEffects();
      });
      return container.querySelector<HTMLButtonElement>('.build-btn');
    };

    expect((await renderWithStatus('refining'))?.textContent).toContain('Analyzing your idea');
    expect((await renderWithStatus('loading'))?.textContent).toContain('Submitting');
    expect((await renderWithStatus('idle'))?.textContent).toContain('Build My Game');

    // Both busy states must also keep the button from firing a second request.
    expect((await renderWithStatus('refining'))?.disabled).toBe(true);
    expect((await renderWithStatus('loading'))?.disabled).toBe(true);
    expect((await renderWithStatus('idle'))?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('opens sketch modal when sketch button is clicked', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    // Mock HTMLCanvasElement context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,fake');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'Space shooter',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          mockStatus: 'idle',
          mockError: null,
          onGenerateMock: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const sketchBtn = container.querySelector<HTMLButtonElement>('.sketch-btn');
    await act(async () => {
      sketchBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(container.querySelector('.sketch-modal-backdrop')).not.toBeNull();
    expect(container.querySelector('.sketch-modal-title')?.textContent).toContain('Sketch Simple Drawing');

    await act(async () => root.unmount());
  });

  it('shows fallback notice when speech recognition is unsupported', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: '',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          mockStatus: 'idle',
          mockError: null,
          onGenerateMock: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const micBtn = container.querySelector<HTMLButtonElement>('.mic-btn');
    await act(async () => {
      micBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const notice = container.querySelector('.mic-notice-text');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('Speech recognition not supported');

    await act(async () => root.unmount());
  });
});
