// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

/**
 * The QA gate as the creator meets it: type an idea, get questions, answer them.
 *
 * The panel's own behaviour is covered in CreatorQA.test.tsx; what is exercised here
 * is the wiring in App that no unit test could reach — that a refine call parks the
 * session, that a reload rebuilds it from storage, and that the hero button reports
 * refining and submitting as the different things they are.
 */

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

const QUESTIONS = [
  {
    id: 'visual_style',
    question: 'What visual style fits best?',
    options: [{ label: 'Pixel Art' }, { label: 'Low-poly 3D' }],
    allowFreeText: true,
  },
  {
    id: 'mechanics',
    question: 'Which mechanics should be in?',
    options: [{ label: 'Crafting' }, { label: 'Trading' }],
    multiple: true,
  },
];

/**
 * Holds the refine response open until the test releases it. A timer here would race
 * the effect flush — the first version of this file used one and passed or failed
 * depending on how long vitest had spent transforming modules.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function mockApi(
  options: {
    onRefine?: (body: { concept: string; locale?: string }) => void;
    gate?: Promise<void>;
    /** Empty models a fully-specified concept: nothing to clarify, still to be named. */
    questions?: typeof QUESTIONS;
    /** Per-locale override — used to prove a language switch re-asks. */
    questionsByLocale?: Record<string, typeof QUESTIONS>;
    suggestedTitle?: string;
    refineFails?: boolean;
    onSubmit?: (body: { title: string; concept: string }) => void;
  } = {},
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/submissions') && init?.method === 'POST') {
      options.onSubmit?.(JSON.parse(String(init.body)) as { title: string; concept: string });
      return new Response(JSON.stringify({ token: 'tok-1', statusUrl: '/api/submissions/tok-1' }));
    }
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
    }
    if (url.endsWith('/api/catalog')) return new Response(JSON.stringify([]));
    if (url.includes('/api/recommendations')) return new Response(JSON.stringify({ items: [] }));
    if (url.includes('/api/quota')) {
      return new Response(JSON.stringify({ submissions: { used: 0, limit: 5 } }));
    }
    if (url.includes('/api/submissions/mine')) return new Response(JSON.stringify({ submissions: [] }));
    if (url.endsWith('/api/submissions/refine')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { concept: string; locale?: string };
      await options.onRefine?.(body);
      if (options.gate) await options.gate;
      if (options.refineFails) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      const locale = body.locale ?? 'en';
      const questions =
        options.questionsByLocale?.[locale] ??
        options.questionsByLocale?.[locale.slice(0, 2)] ??
        options.questions ??
        QUESTIONS;
      return new Response(
        JSON.stringify({
          questions,
          ...(options.suggestedTitle ? { suggestedTitle: options.suggestedTitle } : {}),
        }),
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

async function renderApp() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(App)));
    await flushEffects();
    await flushEffects();
    await flushEffects();
  });
  return { container, root };
}

async function submitIdea(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('.big-prompt-input')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'A survival game on a desert island with crafting and storms');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushEffects();
  });
  await act(async () => {
    container
      .querySelector('.prompt-box-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushEffects();
    await flushEffects();
  });
}

/**
 * The confirm wizard portals itself to document.body, so it is never under the
 * container the app was mounted into — everything about it is queried document-wide.
 */
const inWizard = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);
const wizardOptions = () => document.querySelectorAll<HTMLButtonElement>('.qa-option');

/** One progress cell per stage: the name, one per question, the builder, the review. */
const stageCount = () => document.querySelectorAll('.qa-wizard-progress span').length;

/** Advance one stage with the footer's primary button. */
async function advance() {
  await act(async () => {
    inWizard('.qa-next')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushEffects();
  });
}

/** The wizard opens on the name stage; the questions are one step in. */
const gotoFirstQuestion = advance;

describe('the QA gate in App', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('parks the session so a reload resumes the round instead of re-asking', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    let refineCalls = 0;
    mockApi({ onRefine: () => (refineCalls += 1) });

    const first = await renderApp();
    await submitIdea(first.container);

    expect(inWizard('.qa-wizard')).not.toBeNull();
    // Name, the two questions, the builder, the review.
    expect(stageCount()).toBe(5);

    // Answer one question, then throw the whole app away — the reload.
    await gotoFirstQuestion();
    await act(async () => {
      wizardOptions()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => first.root.unmount());
    document.body.innerHTML = '';

    const second = await renderApp();

    // Back with the questions *and* the answer, without a second refine call.
    expect(stageCount()).toBe(5);
    await gotoFirstQuestion();
    expect(wizardOptions()[0].getAttribute('aria-pressed')).toBe('true');
    expect(refineCalls).toBe(1);

    await act(async () => second.root.unmount());
  });

  it('says analyzing while the refiner runs, not submitting', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const gate = deferred<void>();
    mockApi({ gate: gate.promise });

    const { container, root } = await renderApp();

    const input = container.querySelector<HTMLInputElement>('.big-prompt-input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'A survival game on a desert island with crafting and storms');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    // Submit without awaiting the refine response, to catch the in-flight label.
    await act(async () => {
      container
        .querySelector('.prompt-box-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    const busyStatus = container.querySelector('.prompt-busy-status');
    expect(busyStatus?.textContent).toContain('Analyzing your idea');
    expect(busyStatus?.textContent).not.toContain('Submitting');

    // Release the refiner: the label hands over to the panel, not to "Submitting…".
    await act(async () => {
      gate.resolve();
      await flushEffects();
      await flushEffects();
    });

    expect(inWizard('.qa-wizard')).not.toBeNull();
    expect(container.querySelector('.prompt-busy-status')).toBeNull();
    await act(async () => root.unmount());
  });

  it('drops the parked session when the creator goes back to editing', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockApi();

    const { container, root } = await renderApp();
    await submitIdea(container);
    expect(localStorage.getItem('gamedev_pending_qa')).not.toBeNull();

    await act(async () => {
      inWizard('.qa-wizard-exit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(inWizard('.qa-wizard')).toBeNull();
    // Left behind, it would resurrect the abandoned idea on the next visit.
    expect(localStorage.getItem('gamedev_pending_qa')).toBeNull();

    await act(async () => root.unmount());
  });

  it('stops to have the game named even when there is nothing to clarify', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const submitted: Array<{ title: string; concept: string }> = [];
    mockApi({ questions: [], suggestedTitle: 'Castaway Craft', onSubmit: (body) => submitted.push(body) });

    const { container, root } = await renderApp();
    await submitIdea(container);

    // A clean concept used to go straight to the agent, and the name it was built
    // under was the prompt's first 40 characters. Now it waits here.
    expect(submitted).toHaveLength(0);
    expect(inWizard('.qa-wizard')).not.toBeNull();
    expect(inWizard<HTMLInputElement>('.qa-name-input')?.value).toBe('Castaway Craft');
    // Nothing to clarify, so the round is name, builder, review — no question stages.
    expect(stageCount()).toBe(3);

    await advance(); // builder
    await advance(); // review
    await act(async () => {
      inWizard('.btn-create-now')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.title).toBe('Castaway Craft');

    await act(async () => root.unmount());
  });

  it('fails closed and does not open the naming wizard when the refiner is down', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const submitted: Array<{ title: string; concept: string }> = [];
    mockApi({ refineFails: true, onSubmit: (body) => submitted.push(body) });

    const { container, root } = await renderApp();
    await submitIdea(container);

    // An outage must not look like a clean, already-specified concept: no silent
    // truncated-prompt title, no wizard, just a retry-able error.
    expect(submitted).toHaveLength(0);
    expect(inWizard('.qa-wizard')).toBeNull();
    expect(container.querySelector('.error')?.textContent).toMatch(/couldn't analyze your idea/i);

    await act(async () => root.unmount());
  });

  it('re-asks the questions in Polish when the UI language switches mid-round', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const locales: string[] = [];
    mockApi({
      onRefine: (body) => locales.push(body.locale ?? 'en'),
      questionsByLocale: {
        en: QUESTIONS,
        pl: [
          {
            id: 'visual_style',
            question: 'Jaki styl wizualny pasuje najlepiej?',
            options: [{ label: 'Pixel art' }, { label: 'Low-poly 3D' }],
            allowFreeText: true,
          },
        ],
      },
    });

    const { container, root } = await renderApp();
    await submitIdea(container);

    await gotoFirstQuestion();
    expect(inWizard('.qa-title')?.textContent).toContain('What visual style');
    expect(locales).toEqual(['en']);

    // Pick an option so we can prove the language switch clears English selections —
    // those labels would no longer match the Polish options.
    await act(async () => {
      wizardOptions()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(wizardOptions()[0].getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    expect(locales).toEqual(['en', 'pl']);
    // New questions remount the wizard, which restarts it on the name stage.
    expect(stageCount()).toBe(4);
    await gotoFirstQuestion();
    expect(inWizard('.qa-title')?.textContent).toContain('Jaki styl wizualny');
    // Old English selection must not linger under the new options.
    expect(wizardOptions()[0].getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('gamedev_pending_qa')!).locale).toBe('pl');

    await act(async () => root.unmount());
  });

  it('disables QA controls while relocalizing during a language switch', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const gate = deferred<void>();
    let refineCalls = 0;
    mockApi({
      onRefine: async () => {
        refineCalls += 1;
        if (refineCalls === 2) await gate.promise;
      },
      questionsByLocale: {
        en: QUESTIONS,
        pl: [
          {
            id: 'visual_style',
            question: 'Jaki styl wizualny?',
            options: [{ label: 'Pixel art' }],
            allowFreeText: true,
          },
        ],
      },
    });

    const { container, root } = await renderApp();
    await submitIdea(container);

    await gotoFirstQuestion();
    expect(inWizard<HTMLButtonElement>('.qa-next')?.disabled).toBe(false);
    expect(wizardOptions()[0].disabled).toBe(false);

    // Switch language to trigger relocalization (which is the 2nd refine call, paused on `gate.promise`)
    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
    });

    // While relocalization is in flight, controls in CreatorQA must be disabled
    expect(inWizard<HTMLButtonElement>('.qa-next')?.disabled).toBe(true);
    expect(wizardOptions()[0].disabled).toBe(true);
    expect(inWizard<HTMLButtonElement>('.qa-wizard-exit')?.disabled).toBe(true);

    // Resolve relocalization call
    await act(async () => {
      gate.resolve();
      await flushEffects();
      await flushEffects();
    });

    // The new questions remount the wizard back on the name stage, live again.
    expect(inWizard<HTMLButtonElement>('.qa-next')?.disabled).toBe(false);
    await gotoFirstQuestion();
    expect(wizardOptions()[0].disabled).toBe(false);
    await act(async () => root.unmount());
  });

  it('preserves existing questions when relocalization returns an empty fail-open response', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockApi({
      questionsByLocale: {
        en: QUESTIONS,
        pl: [], // Model returns empty array on fail-open/timeout
      },
    });

    const { container, root } = await renderApp();
    await submitIdea(container);

    expect(stageCount()).toBe(5);

    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
      await flushEffects();
    });

    // The 2 English questions must be retained, not erased into a name-only round
    expect(stageCount()).toBe(5);
    await gotoFirstQuestion();
    expect(inWizard('.qa-title')?.textContent).toContain('What visual style');
    await act(async () => root.unmount());
  });

  it('preserves user-entered custom text when switching UI language', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockApi({
      questionsByLocale: {
        en: QUESTIONS,
        pl: [
          {
            id: 'visual_style',
            question: 'Jaki styl wizualny pasuje najlepiej?',
            options: [{ label: 'Pixel art' }, { label: 'Low-poly 3D' }],
            allowFreeText: true,
          },
        ],
      },
    });

    const { container, root } = await renderApp();
    await submitIdea(container);

    await gotoFirstQuestion();
    const customInput = inWizard<HTMLInputElement>('.qa-custom-input input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(customInput, 'with Amiga palette');
      customInput.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    expect(customInput.value).toBe('with Amiga palette');

    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
      await flushEffects();
    });

    await gotoFirstQuestion();
    expect(inWizard<HTMLInputElement>('.qa-custom-input input')?.value).toBe('with Amiga palette');
    await act(async () => root.unmount());
  });
});
