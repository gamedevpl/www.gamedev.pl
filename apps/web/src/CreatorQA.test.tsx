// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorQA, type QAQuestion } from './CreatorQA';
import i18n from './i18n';

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
});
