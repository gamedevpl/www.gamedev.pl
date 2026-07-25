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
