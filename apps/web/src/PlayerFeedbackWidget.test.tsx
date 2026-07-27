// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';

const authState = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...authState, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const feedbackApi = vi.hoisted(() => ({
  submitPlayerFeedback: vi.fn(),
}));
vi.mock('./playerFeedbackApi', () => feedbackApi);

import { PlayerFeedbackWidget } from './PlayerFeedbackWidget';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authState.user = null;
  feedbackApi.submitPlayerFeedback.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<PlayerFeedbackWidget slug="brick-storm" />);
  });
}

function toggleButton(): HTMLButtonElement {
  return container.querySelector('.feedback-btn')!;
}

// React tracks controlled-input values through its own property descriptor, so a
// plain `element.value = x` assignment is invisible to it — the native setter must
// be invoked directly for the subsequent 'input' event to carry the new value.
function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('PlayerFeedbackWidget', () => {
  it('stays clickable when signed out and opens sign-in instead of looking broken', async () => {
    authState.user = null;
    await draw();
    const button = toggleButton();
    // Clickable, not greyed-out — the title explains why a click needs a session.
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.title).toMatch(/sign in/i);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.feedback-input')).toBeNull();
    expect(document.body.textContent).toMatch(/sign in to leave feedback/i);
  });

  it('signed in, clicking the control opens the feedback form', async () => {
    authState.user = { uid: 'g:me' };
    await draw();
    const button = toggleButton();
    expect(button.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.feedback-input')).not.toBeNull();
  });

  it('the submit button stays disabled below the 10-character minimum', async () => {
    authState.user = { uid: 'g:me' };
    await draw();
    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.feedback-input') as HTMLTextAreaElement;
    const submit = container.querySelector('.feedback-actions button') as HTMLButtonElement;
    expect(submit.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      typeInto(textarea, 'short');
    });
    expect(submit.hasAttribute('disabled')).toBe(true);
  });

  it('submits the trimmed text and shows confirmation on success', async () => {
    authState.user = { uid: 'g:me' };
    feedbackApi.submitPlayerFeedback.mockResolvedValue(undefined);
    await draw();
    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.feedback-input') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, '  Level two is much harder than level one.  ');
    });

    const submit = container.querySelector('.feedback-actions button') as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(feedbackApi.submitPlayerFeedback).toHaveBeenCalledWith(
      'brick-storm',
      'Level two is much harder than level one.',
    );
    expect(container.querySelector('.feedback-sent')).not.toBeNull();
  });

  it('shows a quota message without losing the drafted text', async () => {
    authState.user = { uid: 'g:me' };
    const quotaError = Object.assign(new Error('daily feedback quota exceeded'), { status: 429 });
    feedbackApi.submitPlayerFeedback.mockRejectedValue(quotaError);
    await draw();
    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.feedback-input') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'Great game but level three softlocks for me.');
    });

    const submit = container.querySelector('.feedback-actions button') as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toMatch(/try again tomorrow/i);
    expect((container.querySelector('.feedback-input') as HTMLTextAreaElement).value).toContain('softlocks');
  });
});
