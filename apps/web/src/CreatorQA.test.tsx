// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorQA, type QAQuestion } from './CreatorQA.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreatorQA', () => {
  afterEach(() => {
    document.body.innerHTML = '';
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

  it('renders questions and allows selecting an option chip', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submittedConcept = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: (concept) => {
            submittedConcept = concept;
          },
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.qa-title')).not.toBeNull();
    expect(container.querySelector('.qa-card__question')?.textContent).toContain('What visual style');

    const chips = container.querySelectorAll<HTMLButtonElement>('.qa-chip');
    expect(chips).toHaveLength(2);

    // Select 'Pixel Art' chip
    await act(async () => {
      chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(chips[0].classList.contains('qa-chip--selected')).toBe(true);

    // Click "Create Now" button
    const createBtn = container.querySelector<HTMLButtonElement>('.btn-create-now');
    await act(async () => {
      createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(submittedConcept).toContain('Dodge the falling rocks');
    expect(submittedConcept).toContain('## Creator clarifications');
    expect(submittedConcept).toContain('- What visual style fits best: Pixel Art');

    await act(async () => root.unmount());
  });

  it('combines a chosen chip with free text instead of dropping the chip', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submittedConcept = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: (concept) => {
            submittedConcept = concept;
          },
        }),
      );
      await flushEffects();
    });

    const chips = container.querySelectorAll<HTMLButtonElement>('.qa-chip');
    await act(async () => {
      chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const input = container.querySelector<HTMLInputElement>('.qa-custom-input .input-text');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'but with an Amiga palette');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    // The chip stays lit — un-highlighting it is what made the old data loss invisible.
    expect(chips[0].classList.contains('qa-chip--selected')).toBe(true);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.btn-create-now')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(submittedConcept).toContain('- What visual style fits best: Pixel Art — but with an Amiga palette');

    await act(async () => root.unmount());
  });

  it('accumulates chips on a multi-choice question and restores saved answers', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

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
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: multiQuestion,
          initialConcept: 'A trading game',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: (concept) => {
            submittedConcept = concept;
          },
          // Restored from a previous visit — the reload case.
          initialAnswers: { selected: { mechanics: ['Crafting'] }, custom: {} },
          onAnswersChange: (answers) => answerSnapshots.push(answers),
        }),
      );
      await flushEffects();
    });

    const chips = container.querySelectorAll<HTMLButtonElement>('.qa-chip');
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      chips[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    // Single-choice would have replaced 'Crafting'; this one keeps both.
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(answerSnapshots.at(-1)?.selected.mechanics).toEqual(['Crafting', 'Trading']);

    // Clicking a lit chip still clears it, so "no opinion" stays reachable.
    await act(async () => {
      chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.btn-create-now')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(submittedConcept).toContain('- Which mechanics should be in: Trading');

    await act(async () => root.unmount());
  });

  it('stays up and says so while the submission is in flight', async () => {
    // The panel used to unmount the instant you approved, leaving blank space for as
    // long as the API took to create the issue. It now reports its own progress.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: vi.fn(),
          onCancel: vi.fn(),
          submitting: true,
          error: 'Daily quota exceeded',
        }),
      );
      await flushEffects();
    });

    const createBtns = container.querySelectorAll<HTMLButtonElement>('.btn-create-now');
    expect(createBtns).toHaveLength(2);
    for (const btn of createBtns) {
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('Submitting');
    }

    // Walking away mid-flight would strand a submission the creator can't see.
    expect(container.querySelector<HTMLButtonElement>('.btn-secondary')?.disabled).toBe(true);
    // The error belongs where the creator is looking, not only up in the hero.
    expect(container.querySelector('.qa-error')?.textContent).toBe('Daily quota exceeded');

    await act(async () => root.unmount());
  });

  it('labels the secondary action for what it does — dismiss, not submit', async () => {
    // It used to read "Skip Clarifications", which promises the thing the primary
    // button does. Whatever the wording becomes, it must not imply a submission.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submitted = false;
    let cancelled = false;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: () => {
            submitted = true;
          },
          onCancel: () => {
            cancelled = true;
          },
        }),
      );
      await flushEffects();
    });

    const cancelBtn = container.querySelector<HTMLButtonElement>('.btn-secondary');
    expect(cancelBtn?.textContent).toBe('Back to Editing');

    await act(async () => {
      cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(cancelled).toBe(true);
    expect(submitted).toBe(false);

    await act(async () => root.unmount());
  });

  it('submits initial concept unchanged when no chips or custom answers are selected', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submittedConcept = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: (concept) => {
            submittedConcept = concept;
          },
        }),
      );
      await flushEffects();
    });

    const createBtn = container.querySelector<HTMLButtonElement>('.btn-create-now');
    await act(async () => {
      createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(submittedConcept).toBe('Dodge the falling rocks and survive as long as possible');
    expect(submittedConcept).not.toContain('## Creator clarifications');

    await act(async () => root.unmount());
  });

  it('carries the name the creator settled on, not the one that was suggested', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submittedTitle = '';
    const onTitleChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: mockQuestions,
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onTitleChange,
          onSubmitWithConcept: (_concept, title) => {
            submittedTitle = title;
          },
        }),
      );
      await flushEffects();
    });

    const name = container.querySelector<HTMLInputElement>('.qa-name-input');
    expect(name?.value).toBe('Rock Dodger');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, '  Boulder Panic  ');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    // Reported as it is typed, so the caller can park it with the rest of the session.
    expect(onTitleChange).toHaveBeenLastCalledWith('  Boulder Panic  ');

    await act(async () => {
      container.querySelector('.btn-create-now')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(submittedTitle).toBe('Boulder Panic');

    await act(async () => root.unmount());
  });

  it('will not start a build on a name too short to submit', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onSubmit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // The refiner had nothing to suggest and the concept yielded nothing either, so
    // the box starts empty and the creator has to name the thing themselves.
    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: [],
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: '',
          onSubmitWithConcept: onSubmit,
        }),
      );
      await flushEffects();
    });

    const createBtn = container.querySelector<HTMLButtonElement>('.btn-create-now');
    expect(createBtn?.disabled).toBe(true);

    await act(async () => {
      createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    const name = container.querySelector<HTMLInputElement>('.qa-name-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Rock Dodger');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    expect(container.querySelector<HTMLButtonElement>('.btn-create-now')?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it('is still the naming step when the refiner asked nothing', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: [],
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          onSubmitWithConcept: vi.fn(),
        }),
      );
      await flushEffects();
    });

    // A heading about clarifying questions, over no questions, is a panel that looks
    // broken. With nothing to clarify it says what it is actually for.
    expect(container.querySelector('.qa-title')?.textContent).toContain('Name your game');
    expect(container.querySelector('.qa-name-input')).not.toBeNull();
    expect(container.querySelectorAll('.qa-card')).toHaveLength(0);
    // One button, not two: the second exists to be reachable after a long list.
    expect(container.querySelectorAll('.btn-create-now')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it('lets the creator choose a builder and passes it on submit', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    let submittedBuilder = '';
    const onBuilderChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorQA, {
          questions: [],
          initialConcept: 'Dodge the falling rocks and survive as long as possible',
          initialTitle: 'Rock Dodger',
          initialBuilder: 'platform',
          onBuilderChange,
          onSubmitWithConcept: (_concept, _title, builder) => {
            submittedBuilder = builder;
          },
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.builder-choice')).not.toBeNull();
    const options = container.querySelectorAll<HTMLButtonElement>('.builder-choice-option');
    expect(options[0].getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(onBuilderChange).toHaveBeenCalledWith('self');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.btn-create-now')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(submittedBuilder).toBe('self');

    await act(async () => root.unmount());
  });
});
