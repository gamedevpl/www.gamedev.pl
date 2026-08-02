// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorQA, type QAQuestion } from './CreatorQA.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * The wizard portals itself to document.body, so nothing it renders is under the
 * container the root was mounted into — every query here is document-wide.
 */
const find = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);
const findAll = <T extends Element>(selector: string): NodeListOf<T> => document.querySelectorAll<T>(selector);

async function click(element: Element | null | undefined) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushEffects();
  });
}

async function type(input: HTMLInputElement | null, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    await flushEffects();
  });
}

/** Advance one stage via the footer's primary button (Continue / Next / Skip / Review). */
const next = () => click(find('.qa-next'));

const options = () => findAll<HTMLButtonElement>('.qa-option');
const heading = () => find('.qa-title')?.textContent ?? '';

async function render(props: Record<string, unknown>): Promise<Root> {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CreatorQA, props as never));
    await flushEffects();
  });
  return root;
}

describe('CreatorQA', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  const mockQuestions: QAQuestion[] = [
    {
      id: 'visual_style',
      question: 'What visual style fits best?',
      options: [
        { label: 'Pixel Art', detail: 'Retro 8-bit aesthetic' },
        { label: 'Neon Arcade', detail: 'Glowing vector lines' },
      ],
      allowFreeText: true,
    },
  ];

  const baseProps = {
    questions: mockQuestions,
    initialConcept: 'Dodge the falling rocks and survive as long as possible',
    initialTitle: 'Rock Dodger',
  };

  it('opens on the name stage and walks to review before anything is submitted', async () => {
    let submittedConcept = '';
    const root = await render({
      ...baseProps,
      onSubmitWithConcept: (concept: string) => {
        submittedConcept = concept;
      },
    });

    // Name first: it is the prerequisite the build waits on.
    expect(find('.qa-name-input')).not.toBeNull();
    expect(findAll('.qa-option')).toHaveLength(0);
    // Three stages: name, the one question, builder, review.
    expect(find('.qa-wizard-step')?.textContent).toBe('Step 1 of 4');

    await next();
    expect(heading()).toContain('What visual style');
    expect(options()).toHaveLength(2);

    await click(options()[0]);
    expect(options()[0].classList.contains('qa-option--selected')).toBe(true);

    await next(); // builder
    await next(); // review

    // Nothing is submitted until the creator presses the button on the review stage.
    expect(submittedConcept).toBe('');
    await click(find('.btn-create-now'));

    expect(submittedConcept).toContain('Dodge the falling rocks');
    expect(submittedConcept).toContain('## Creator clarifications');
    expect(submittedConcept).toContain('- What visual style fits best: Pixel Art');

    await act(async () => root.unmount());
  });

  it('does not advance when an option is chosen — moving on is always explicit', async () => {
    // Auto-advancing on selection made a tap yank the screen away mid-thought, and it
    // was inconsistent with multi-choice questions, where the same gesture must not.
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });

    await next();
    const before = find('.qa-wizard-step')?.textContent;
    await click(options()[0]);

    expect(find('.qa-wizard-step')?.textContent).toBe(before);
    expect(heading()).toContain('What visual style');

    await act(async () => root.unmount());
  });

  it('offers Skip until a question is answered, then Next', async () => {
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });
    await next();

    const skip = find<HTMLButtonElement>('.qa-next');
    expect(skip?.textContent).toContain('Skip');
    expect(skip?.classList.contains('qa-next--skip')).toBe(true);

    await click(options()[1]);
    expect(find<HTMLButtonElement>('.qa-next')?.textContent).toContain('Next');
    expect(find<HTMLButtonElement>('.qa-next')?.classList.contains('qa-next--skip')).toBe(false);

    await act(async () => root.unmount());
  });

  it('combines a chosen option with free text instead of dropping the option', async () => {
    let submittedConcept = '';
    const root = await render({
      ...baseProps,
      onSubmitWithConcept: (concept: string) => {
        submittedConcept = concept;
      },
    });

    await next();
    await click(options()[0]);
    await type(find<HTMLInputElement>('.qa-custom-input .input-text'), 'but with an Amiga palette');

    // The option stays lit — un-highlighting it is what made the old data loss invisible.
    expect(options()[0].classList.contains('qa-option--selected')).toBe(true);
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    expect(options()[1].getAttribute('aria-pressed')).toBe('false');

    await next();
    await next();
    await click(find('.btn-create-now'));

    expect(submittedConcept).toContain('- What visual style fits best: Pixel Art — but with an Amiga palette');

    await act(async () => root.unmount());
  });

  it('accumulates options on a multi-choice question and restores saved answers', async () => {
    const multiQuestion: QAQuestion[] = [
      {
        id: 'mechanics',
        question: 'Which mechanics should be in?',
        options: [{ label: 'Crafting' }, { label: 'Trading' }, { label: 'Combat' }],
        multiple: true,
      },
    ];

    let submittedConcept = '';
    const answerSnapshots: Array<{ selected: Record<string, string[]>; custom: Record<string, string> }> = [];
    const root = await render({
      questions: multiQuestion,
      initialConcept: 'A trading game',
      initialTitle: 'Rock Dodger',
      onSubmitWithConcept: (concept: string) => {
        submittedConcept = concept;
      },
      // Restored from a previous visit — the reload case.
      initialAnswers: { selected: { mechanics: ['Crafting'] }, custom: {} },
      onAnswersChange: (answers: { selected: Record<string, string[]>; custom: Record<string, string> }) =>
        answerSnapshots.push(answers),
    });

    await next();
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');

    await click(options()[1]);

    // Single-choice would have replaced 'Crafting'; this one keeps both.
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    expect(options()[1].getAttribute('aria-pressed')).toBe('true');
    expect(answerSnapshots.at(-1)?.selected.mechanics).toEqual(['Crafting', 'Trading']);

    // Clicking a lit option still clears it, so "no opinion" stays reachable.
    await click(options()[0]);
    expect(options()[0].getAttribute('aria-pressed')).toBe('false');

    await next();
    await next();
    await click(find('.btn-create-now'));

    expect(submittedConcept).toContain('- Which mechanics should be in: Trading');

    await act(async () => root.unmount());
  });

  it('jumps straight to review from the shortcut, and shows what was left unanswered', async () => {
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });

    await click(find('.qa-shortcut'));

    // The shortcut lands on the summary, not on a blind submission.
    expect(find('.btn-create-now')).not.toBeNull();
    const values = [...findAll('.qa-review-value')].map((row) => row.textContent ?? '');
    expect(values[0]).toContain('Rock Dodger');
    expect(values[1]).toContain('AI decides');
    expect(find('.qa-review-unset')).not.toBeNull();

    // Edit goes back to the stage that sets that answer.
    await click(findAll('.qa-review-edit')[1]);
    expect(heading()).toContain('What visual style');

    await act(async () => root.unmount());
  });

  it('stays on the review stage and says so while the submission is in flight', async () => {
    // The panel used to unmount the instant you approved, leaving blank space for as
    // long as the API took to create the issue. It now reports its own progress —
    // in place, on the stage the creator pressed the button from.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = { ...baseProps, onSubmitWithConcept: vi.fn(), onCancel: vi.fn() };

    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    await act(async () => {
      root.render(createElement(CreatorQA, props as never));
      await flushEffects();
    });

    await click(find('.qa-shortcut'));
    expect(find('.btn-create-now')).not.toBeNull();

    // The submission is now in flight, exactly as the caller re-renders it.
    await act(async () => {
      root.render(createElement(CreatorQA, { ...props, submitting: true, error: 'Daily quota exceeded' } as never));
      await flushEffects();
    });

    const createBtn = find<HTMLButtonElement>('.btn-create-now');
    expect(createBtn?.disabled).toBe(true);
    expect(createBtn?.textContent).toContain('Submitting');
    // Walking away mid-flight would strand a submission the creator can't see.
    expect(find<HTMLButtonElement>('.qa-wizard-exit')?.disabled).toBe(true);
    expect(findAll<HTMLButtonElement>('.qa-review-edit')[0].disabled).toBe(true);
    // The error belongs where the creator is looking, not only up in the hero.
    expect(find('.qa-error')?.textContent).toBe('Daily quota exceeded');

    await act(async () => root.unmount());
  });

  it('labels the exit for what it does — dismiss, not submit', async () => {
    // It used to read "Skip Clarifications", which promises the thing the primary
    // button does. Whatever the wording becomes, it must not imply a submission.
    let submitted = false;
    let cancelled = false;
    const root = await render({
      ...baseProps,
      onSubmitWithConcept: () => {
        submitted = true;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    const exit = find<HTMLButtonElement>('.qa-wizard-exit');
    expect(exit?.textContent).toContain('Back to editing');

    await click(exit);
    expect(cancelled).toBe(true);
    expect(submitted).toBe(false);

    await act(async () => root.unmount());
  });

  it('submits initial concept unchanged when every question is skipped', async () => {
    let submittedConcept = '';
    const root = await render({
      ...baseProps,
      onSubmitWithConcept: (concept: string) => {
        submittedConcept = concept;
      },
    });

    await next(); // question
    await next(); // skip it
    await next(); // builder
    await click(find('.btn-create-now'));

    expect(submittedConcept).toBe('Dodge the falling rocks and survive as long as possible');
    expect(submittedConcept).not.toContain('## Creator clarifications');

    await act(async () => root.unmount());
  });

  it('carries the name the creator settled on, not the one that was suggested', async () => {
    let submittedTitle = '';
    const onTitleChange = vi.fn();
    const root = await render({
      ...baseProps,
      onTitleChange,
      onSubmitWithConcept: (_concept: string, title: string) => {
        submittedTitle = title;
      },
    });

    const name = find<HTMLInputElement>('.qa-name-input');
    expect(name?.value).toBe('Rock Dodger');

    await type(name, '  Boulder Panic  ');
    // Reported as it is typed, so the caller can park it with the rest of the session.
    expect(onTitleChange).toHaveBeenLastCalledWith('  Boulder Panic  ');

    await click(find('.qa-shortcut'));
    await click(find('.btn-create-now'));

    expect(submittedTitle).toBe('Boulder Panic');

    await act(async () => root.unmount());
  });

  it('will not leave the name stage on a name too short to submit', async () => {
    const onSubmit = vi.fn();
    // The refiner had nothing to suggest and the concept yielded nothing either, so
    // the box starts empty and the creator has to name the thing themselves.
    const root = await render({
      ...baseProps,
      questions: [],
      initialTitle: '',
      onSubmitWithConcept: onSubmit,
    });

    expect(find<HTMLButtonElement>('.qa-next')?.disabled).toBe(true);
    await next();
    expect(find('.qa-name-input')).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    await type(find<HTMLInputElement>('.qa-name-input'), 'Rock Dodger');
    expect(find<HTMLButtonElement>('.qa-next')?.disabled).toBe(false);

    await next();
    expect(find('.builder-choice')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('is still the naming step when the refiner asked nothing', async () => {
    const root = await render({ ...baseProps, questions: [], onSubmitWithConcept: vi.fn() });

    // A heading about clarifying questions, over no questions, is a wizard that looks
    // broken. With nothing to clarify it says what it is actually for.
    expect(heading()).toContain('Name your game');
    expect(find('.qa-name-input')).not.toBeNull();
    // No question stages, and so nothing for the shortcut to skip past.
    expect(find('.qa-wizard-step')?.textContent).toBe('Step 1 of 3');
    expect(find('.qa-shortcut')).toBeNull();

    await act(async () => root.unmount());
  });

  it('lets the creator choose a builder and passes it on submit', async () => {
    let submittedBuilder = '';
    const onBuilderChange = vi.fn();
    const root = await render({
      ...baseProps,
      questions: [],
      initialBuilder: 'platform',
      onBuilderChange,
      onSubmitWithConcept: (_concept: string, _title: string, builder: string) => {
        submittedBuilder = builder;
      },
    });

    await next();
    expect(find('.builder-choice')).not.toBeNull();
    const builderOptions = findAll<HTMLButtonElement>('.builder-choice-option');
    expect(builderOptions[0].getAttribute('aria-checked')).toBe('true');

    await click(builderOptions[1]);
    expect(onBuilderChange).toHaveBeenCalledWith('self');

    await next();
    await click(find('.btn-create-now'));
    expect(submittedBuilder).toBe('self');

    await act(async () => root.unmount());
  });

  it('locks the page behind it while it is open', async () => {
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => root.unmount());
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  /**
   * jsdom has no visual viewport, so this is the keyboard as the browser reports it:
   * an object whose height shrinks and whose offsetTop moves, emitting resize/scroll.
   */
  function stubVisualViewport(height: number, offsetTop = 0) {
    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      height,
      offsetTop,
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    };
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true, writable: true });
    return {
      viewport,
      /** The keyboard opening: the visible area shrinks and everything is told. */
      async emit(type: 'resize' | 'scroll', next: { height?: number; offsetTop?: number }) {
        if (next.height !== undefined) viewport.height = next.height;
        if (next.offsetTop !== undefined) viewport.offsetTop = next.offsetTop;
        await act(async () => {
          listeners.get(type)?.forEach((fn) => fn());
          await flushEffects();
        });
      },
      listenerCount: () => (listeners.get('resize')?.size ?? 0) + (listeners.get('scroll')?.size ?? 0),
      restore: () => Reflect.deleteProperty(window, 'visualViewport'),
    };
  }

  it('sizes itself to the visual viewport, so the keyboard cannot bury the footer', async () => {
    // dvh tracks the address bar and stops there: iOS shrinks only the visual viewport
    // for the keyboard, leaving the layout viewport — what a fixed box is sized
    // against — at full height, with Back and Next underneath the keys.
    const vv = stubVisualViewport(844);
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });

    const wizard = find<HTMLElement>('.qa-wizard')!;
    expect(wizard.classList.contains('is-viewport-tracked')).toBe(true);
    expect(wizard.style.getPropertyValue('--qa-viewport-height')).toBe('844px');

    // Keyboard up: the shell follows the visible area rather than the layout viewport.
    await vv.emit('resize', { height: 508 });
    expect(wizard.style.getPropertyValue('--qa-viewport-height')).toBe('508px');

    // ...and iOS scrolling the visual viewport to reveal an input drags the shell with
    // it, which a position:fixed box does not do on its own.
    await vv.emit('scroll', { offsetTop: 62 });
    expect(wizard.style.getPropertyValue('--qa-viewport-offset')).toBe('62px');

    await act(async () => root.unmount());
    expect(vv.listenerCount()).toBe(0);
    vv.restore();
  });

  it('falls back to the stylesheet when the browser has no visual viewport', async () => {
    // The class is what opts into the custom properties. Without the API there is
    // nothing to write into them, so it must stay off and leave dvh in charge.
    Reflect.deleteProperty(window, 'visualViewport');
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });

    const wizard = find<HTMLElement>('.qa-wizard')!;
    expect(wizard.classList.contains('is-viewport-tracked')).toBe(false);
    expect(wizard.style.getPropertyValue('--qa-viewport-height')).toBe('');

    await act(async () => root.unmount());
  });

  it('names the exit even when its label is hidden on a narrow screen', async () => {
    // Below 560px the CSS hides the span, and the icon is decorative — without an
    // explicit label that leaves a phone user with an unnamed button as the only
    // way back to editing.
    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn(), onCancel: vi.fn() });

    expect(find('.qa-wizard-exit')?.getAttribute('aria-label')).toBe('Back to editing');

    await act(async () => root.unmount());
  });

  it('keeps Tab inside the overlay', async () => {
    // aria-modal tells assistive tech this is modal; it does not stop the browser
    // tabbing on into the app shell, which is still focusable behind the overlay.
    const outside = document.createElement('button');
    outside.id = 'behind-the-wizard';
    document.body.appendChild(outside);

    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn(), onCancel: vi.fn() });

    const focusable = findAll<HTMLElement>(
      '.qa-wizard a[href], .qa-wizard button:not([disabled]), .qa-wizard input:not([disabled])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Forward off the end wraps to the top rather than escaping to the page behind.
    last.focus();
    await act(async () => {
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      await flushEffects();
    });
    expect(document.activeElement).toBe(first);

    // And backwards off the front wraps to the end.
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      await flushEffects();
    });
    expect(document.activeElement).toBe(last);

    await act(async () => root.unmount());
  });

  it('still holds focus when a submission has disabled every control', async () => {
    // The trap listed the focusable controls and bailed when it found none. Mid-flight
    // `submitting` disables all of them, so that bail was the one path where Tab was
    // handed back to the browser and walked into the shell behind the overlay.
    const behind = document.createElement('button');
    document.body.appendChild(behind);

    const root = await render({
      ...baseProps,
      onSubmitWithConcept: vi.fn(),
      onCancel: vi.fn(),
      submitting: true,
    });

    expect(findAll('.qa-wizard button:not([disabled]), .qa-wizard input:not([disabled])')).toHaveLength(0);

    const wizard = find<HTMLElement>('.qa-wizard')!;
    await act(async () => {
      wizard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      await flushEffects();
    });

    expect(document.activeElement).toBe(wizard);
    expect(document.activeElement).not.toBe(behind);

    await act(async () => root.unmount());
  });

  it('gives focus back to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const root = await render({ ...baseProps, onSubmitWithConcept: vi.fn() });
    expect(document.activeElement).not.toBe(opener);

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
  });
});
