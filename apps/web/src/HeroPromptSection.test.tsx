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
    vi.unstubAllGlobals();
  });

  it('renders prompt inputs and attach, voice, build controls', async () => {
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

    const attachBtn = container.querySelector('.attach-btn');
    const micBtn = container.querySelector('.mic-btn');
    const buildBtn = container.querySelector('.build-btn');

    expect(attachBtn).not.toBeNull();
    expect(micBtn).not.toBeNull();
    expect(buildBtn).not.toBeNull();
    expect(container.querySelector('.prompt-composer-bar')).not.toBeNull();
    expect(container.querySelectorAll('.chip-btn')).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it('does not autofocus the prompt on a narrow viewport', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

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
        }),
      );
      await flushEffects();
    });

    expect(document.activeElement).not.toBe(container.querySelector('.big-prompt-input'));

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

  it('opens sketch modal from the attach menu', async () => {
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

    const attachBtn = container.querySelector<HTMLButtonElement>('.attach-btn');
    await act(async () => {
      attachBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const sketchItem = Array.from(container.querySelectorAll<HTMLButtonElement>('.prompt-attach-item')).find((btn) =>
      btn.textContent?.includes('Draw Sketch'),
    );
    expect(sketchItem).not.toBeUndefined();

    await act(async () => {
      sketchItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

  it('shows listening immediately and renders interim speech on iPhone-style recognition', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onresult: ((event: { results: Array<{ 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => this.onend?.());
    }

    const recognition = new FakeSpeechRecognition();
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: vi.fn(() => recognition),
    });

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
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.mic-btn')?.click();
      await flushEffects();
    });
    expect(recognition.interimResults).toBe(true);
    expect(container.querySelector('.mic-notice-text')?.textContent).toContain('Listening');
    expect(container.querySelector<HTMLButtonElement>('.mic-btn')?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      recognition.onresult?.({ results: [{ 0: { transcript: 'A flying cat game' } }] });
      await flushEffects();
    });
    expect(container.querySelector<HTMLTextAreaElement>('.big-prompt-input')?.value).toBe('A flying cat game');

    await act(async () => root.unmount());
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
});
