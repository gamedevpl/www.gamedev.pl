// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPromptSection } from './HeroPromptSection.js';
import { toBase64PngList } from './attachmentImages.js';
import i18n from './i18n/index.js';

vi.mock('./attachmentImages.js', () => ({
  toBase64PngList: vi.fn(),
}));

const mockedToBase64PngList = vi.mocked(toBase64PngList);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('HeroPromptSection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockedToBase64PngList.mockReset();
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
        }),
      );
      await flushEffects();
    });

    const textarea = container.querySelector('.big-prompt-input');
    expect(textarea).not.toBeNull();
    expect(textarea?.tagName).toBe('INPUT');

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
        }),
      );
      await flushEffects();
    });

    expect(document.activeElement).not.toBe(container.querySelector('.big-prompt-input'));

    await act(async () => root.unmount());
  });

  it('says it is analyzing while the refiner runs, and submitting only once it is', async () => {
    // refining must not claim Submitting before anything is sent
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
          }),
        );
        await flushEffects();
      });
      return container.querySelector<HTMLButtonElement>('.build-btn');
    };

    expect((await renderWithStatus('refining'))?.textContent).toContain('Analyzing your idea');
    expect((await renderWithStatus('loading'))?.textContent).toContain('Submitting');
    expect((await renderWithStatus('idle'))?.textContent).toContain('Build My Game');

    // Busy must disable the button against a second fire.
    expect((await renderWithStatus('refining'))?.disabled).toBe(true);
    expect((await renderWithStatus('loading'))?.disabled).toBe(true);
    expect((await renderWithStatus('idle'))?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('shows a spinner and status line while the refiner or submit is in flight', async () => {
    // Icon-only send needs a spinner; faded arrow looked stuck.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderWithStatus = async (submissionStatus: 'idle' | 'refining' | 'loading') => {
      await act(async () => {
        root.render(
          createElement(HeroPromptSection, {
            initialPrompt: 'Lets create a remake of Beasts and Pumpkins game',
            catalogEntries: [],
            submissionStatus,
            submissionError: null,
            onSubmitSpec: vi.fn(),
          }),
        );
        await flushEffects();
      });
    };

    await renderWithStatus('refining');
    expect(container.querySelector('.prompt-composer-bar.is-busy')).not.toBeNull();
    expect(container.querySelector('.build-btn.is-busy')).not.toBeNull();
    expect(container.querySelector('.build-btn-spinner')).not.toBeNull();
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Analyzing your idea/i);
    expect(container.querySelector('.creation-card.is-busy .creation-sub')?.textContent).toMatch(/Become the creator/i);
    expect(container.querySelector('.creation-card.is-busy .creation-sub')?.textContent).not.toMatch(
      /Analyzing your idea/i,
    );
    expect(container.querySelector<HTMLInputElement>('.big-prompt-input')?.disabled).toBe(true);
    expect(container.querySelector('.prompt-box-form')?.getAttribute('aria-busy')).toBe('true');

    await renderWithStatus('loading');
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Submitting/i);
    expect(container.querySelector('.build-btn-spinner')).not.toBeNull();

    await renderWithStatus('idle');
    expect(container.querySelector('.prompt-composer-bar.is-busy')).toBeNull();
    expect(container.querySelector('.build-btn-spinner')).toBeNull();
    expect(container.querySelector('.prompt-busy-status')).toBeNull();
    expect(container.querySelector('.creation-card.is-busy')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('.big-prompt-input')?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('closes the attach menu and ignores drops while busy', async () => {
    // Busy must lock attachments: menu and drag-drop too.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'a quiet garden game',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.attach-btn')?.click();
      await flushEffects();
    });
    expect(container.querySelector('.prompt-attach-menu')).not.toBeNull();

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'a quiet garden game',
          catalogEntries: [],
          submissionStatus: 'refining',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.prompt-attach-menu')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.attach-btn')?.disabled).toBe(true);

    const card = container.querySelector('.hero-prompt-card')!;
    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(drop, 'dataTransfer', {
        value: { files: [file] },
      });
      card.dispatchEvent(drop);
      await flushEffects();
      await flushEffects();
    });
    expect(container.querySelector('.attachments-list')).toBeNull();

    await act(async () => root.unmount());
  });

  it('attaches an image pasted into the prompt field', async () => {
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
        }),
      );
      await flushEffects();
    });

    const input = container.querySelector('.big-prompt-input')!;
    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => file }] },
      });
      input.dispatchEvent(paste);
      // FileReader resolves on a real macrotask in jsdom, not a microtask.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector('.attachments-list')).not.toBeNull();
    expect(container.querySelector('.attachment-thumb')?.getAttribute('alt')).toBe('sprite.png');

    await act(async () => root.unmount());
  });

  it('blocks submit until a pasted image finishes loading', async () => {
    // Codex #887: a same-tick submit after paste raced the FileReader.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const onSubmitSpec = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'a quiet garden game',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec,
        }),
      );
      await flushEffects();
    });

    const input = container.querySelector('.big-prompt-input')!;
    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => file }] },
      });
      input.dispatchEvent(paste);
      // Deliberately not awaiting the FileReader's macrotask.
      await flushEffects();
    });

    expect(container.querySelector<HTMLButtonElement>('.build-btn')?.disabled).toBe(true);
    await act(async () => {
      container
        .querySelector('.prompt-box-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });
    expect(onSubmitSpec).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector<HTMLButtonElement>('.build-btn')?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('disables Build while an attachment is being normalized', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let resolveNormalization!: (images: string[]) => void;
    mockedToBase64PngList.mockReturnValue(
      new Promise((resolve) => {
        resolveNormalization = resolve;
      }),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSubmitSpec = vi.fn();

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'a quiet garden game',
          catalogEntries: [],
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec,
        }),
      );
      await flushEffects();
    });

    const card = container.querySelector('.hero-prompt-card')!;
    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(drop, 'dataTransfer', {
        value: { files: [file] },
      });
      card.dispatchEvent(drop);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await act(async () => {
      container
        .querySelector('.prompt-box-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });
    expect(container.querySelector<HTMLButtonElement>('.build-btn')?.disabled).toBe(true);
    expect(onSubmitSpec).not.toHaveBeenCalled();

    await act(async () => {
      resolveNormalization(['small']);
      await flushEffects();
    });
    expect(container.querySelector<HTMLButtonElement>('.build-btn')?.disabled).toBe(false);
    expect(onSubmitSpec).toHaveBeenCalledTimes(1);

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
    expect(container.querySelector<HTMLInputElement>('.big-prompt-input')?.value).toBe('A flying cat game');

    await act(async () => root.unmount());
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('renders a matched game card with thumbnail, genre badge, and play button', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPlayGame = vi.fn();

    const mockCatalog = [
      {
        slug: 'mexico-86',
        title: "Mexico '86 Arcade Football",
        genre: 'sports',
        controls: 'Arrows / Enter / Tap to navigate; 1–4 to pick action',
        status: 'published',
        media: {
          screenshots: [
            { name: 'opening', file: 'opening.png' },
            { name: 'action', file: 'action.png' },
          ],
          video: null,
        },
        multiplayer: { mode: 'controllers' as const, minPlayers: 1, maxPlayers: 2 },
        saves: null,
        world: null,
        sensing: null,
        orientation: 'landscape' as const,
        submittedBy: null,
      },
    ];

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'mexico',
          catalogEntries: mockCatalog,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          onPlayGame,
        }),
      );
      await flushEffects();
    });

    const card = container.querySelector('.matched-card');
    expect(card).not.toBeNull();

    const thumb = container.querySelector<HTMLImageElement>('.matched-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('src')).toBe('/api/games/mexico-86/media/action.png?w=320');

    const title = container.querySelector('.matched-title');
    expect(title?.textContent).toBe("Mexico '86 Arcade Football");

    const badges = container.querySelectorAll('.smart-badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0].textContent).toContain('sports');

    const playBtn = container.querySelector<HTMLButtonElement>('.play-match-btn');
    expect(playBtn).not.toBeNull();
    expect(playBtn?.textContent).toContain("Play Mexico '86 Arcade Football Now");

    await act(async () => {
      playBtn?.click();
      await flushEffects();
    });

    expect(onPlayGame).toHaveBeenCalledTimes(1);
    expect(onPlayGame).toHaveBeenCalledWith(mockCatalog[0], 'composer_match');

    await act(async () => root.unmount());
  });

  it('matches games by searchKeywords and displays enriched tagline', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockCatalog = [
      {
        slug: 'mexico-86',
        title: "Mexico '86 Arcade Football",
        genre: 'sports',
        controls: 'Arrows / Enter / Tap to navigate; 1–4 to pick action',
        status: 'published',
        media: null,
        multiplayer: null,
        saves: null,
        world: null,
        sensing: null,
        orientation: 'landscape' as const,
        submittedBy: null,
        tagline: {
          en: 'Retro 11v11 arcade soccer tournament.',
          pl: 'Turniej piłkarski retro 11v11.',
        },
        shortControls: {
          en: 'Arrows + Enter / Tap',
          pl: 'Strzałki + Enter / Dotyk',
        },
        searchKeywords: ['mundial', 'soccer', 'maradona', 'football'],
      },
    ];

    // Search by semantic keyword "mundial"
    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'mundial',
          catalogEntries: mockCatalog,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const card = container.querySelector('.matched-card');
    expect(card).not.toBeNull();

    const desc = container.querySelector('.matched-desc');
    expect(desc?.textContent).toBe('Retro 11v11 arcade soccer tournament.');

    await act(async () => root.unmount());
  });
});
