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
      options.onRefine?.(body);
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
  const textarea = container.querySelector<HTMLTextAreaElement>('.big-prompt-input')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, 'A survival game on a desert island with crafting and storms');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
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

describe('the QA gate in App', () => {
  afterEach(() => {
    document.body.innerHTML = '';
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

    expect(first.container.querySelector('.qa-container')).not.toBeNull();
    expect(first.container.querySelectorAll('.qa-card')).toHaveLength(2);

    // Answer one question, then throw the whole app away — the reload.
    const chips = first.container.querySelectorAll<HTMLButtonElement>('.qa-chip');
    await act(async () => {
      chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => first.root.unmount());
    document.body.innerHTML = '';

    const second = await renderApp();

    // Back with the questions *and* the answer, without a second refine call.
    expect(second.container.querySelectorAll('.qa-card')).toHaveLength(2);
    const restoredChips = second.container.querySelectorAll<HTMLButtonElement>('.qa-chip');
    expect(restoredChips[0].getAttribute('aria-pressed')).toBe('true');
    expect(refineCalls).toBe(1);

    await act(async () => second.root.unmount());
  });

  it('says analyzing while the refiner runs, not submitting', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const gate = deferred<void>();
    mockApi({ gate: gate.promise });

    const { container, root } = await renderApp();

    const textarea = container.querySelector<HTMLTextAreaElement>('.big-prompt-input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'A survival game on a desert island with crafting and storms');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    // Submit without awaiting the refine response, to catch the in-flight label.
    await act(async () => {
      container
        .querySelector('.prompt-box-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    const buildBtn = container.querySelector<HTMLButtonElement>('.build-btn');
    expect(buildBtn?.textContent).toContain('Analyzing your idea');
    expect(buildBtn?.textContent).not.toContain('Submitting');
    expect(buildBtn?.disabled).toBe(true);

    // Release the refiner: the label hands over to the panel, not to "Submitting…".
    await act(async () => {
      gate.resolve();
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.qa-container')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.build-btn')?.textContent).toContain('Build My Game');
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
      container
        .querySelector('.qa-container .btn-secondary')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(container.querySelector('.qa-container')).toBeNull();
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
    expect(container.querySelector('.qa-container')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('.qa-name-input')?.value).toBe('Castaway Craft');

    await act(async () => {
      container.querySelector('.btn-create-now')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.title).toBe('Castaway Craft');

    await act(async () => root.unmount());
  });

  it('still asks for a name when the refiner is down, falling back to one from the prompt', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const submitted: Array<{ title: string; concept: string }> = [];
    mockApi({ refineFails: true, onSubmit: (body) => submitted.push(body) });

    const { container, root } = await renderApp();
    await submitIdea(container);

    // Failing open must not mean skipping the step — that is how truncated prompts
    // became titles in the first place. The suggestion degrades; the gate does not.
    expect(submitted).toHaveLength(0);
    const name = container.querySelector<HTMLInputElement>('.qa-name-input');
    expect(name?.value).toBe('A survival game on a desert island with');
    expect(container.querySelectorAll('.qa-card')).toHaveLength(0);

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

    expect(container.querySelector('.qa-card__question')?.textContent).toContain('What visual style');
    expect(locales).toEqual(['en']);

    // Pick a chip so we can prove the language switch clears English selections —
    // those labels would no longer match the Polish options.
    await act(async () => {
      container.querySelector('.qa-chip')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(container.querySelector('.qa-chip')?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    expect(locales).toEqual(['en', 'pl']);
    expect(container.querySelector('.qa-card__question')?.textContent).toContain('Jaki styl wizualny');
    expect(container.querySelectorAll('.qa-card')).toHaveLength(1);
    // Old English selection must not linger under the new chips.
    expect(container.querySelector('.qa-chip')?.getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('gamedev_pending_qa')!).locale).toBe('pl');

    await act(async () => root.unmount());
  });
});
