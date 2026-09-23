// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const authState = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...authState, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const reportApi = vi.hoisted(() => ({
  submitGameReport: vi.fn(),
}));
vi.mock('./reportGameApi', () => reportApi);

import { InAppGameReport } from './InAppGameReport.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authState.user = null;
  reportApi.submitGameReport.mockReset();
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
    root!.render(<InAppGameReport slug="brick-storm" />);
  });
}

function toggleButton(): HTMLButtonElement {
  return container.querySelector('.report-widget .report-btn')!;
}

function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('InAppGameReport', () => {
  it('stays clickable when signed out and opens sign-in instead of looking broken', async () => {
    authState.user = null;
    await draw();
    const button = toggleButton();
    expect(button.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.report-popover')).toBeNull();
    expect(document.body.textContent).toMatch(/sign in to report/i);
  });

  it('signed in, clicking the control opens the report form with a reason picker', async () => {
    authState.user = { uid: 'g:me' };
    await draw();

    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.report-reason-select')).not.toBeNull();
    expect(container.querySelector('.feedback-input')).not.toBeNull();
  });

  it('submits the chosen reason and trimmed note, then shows confirmation', async () => {
    authState.user = { uid: 'g:me' };
    reportApi.submitGameReport.mockResolvedValue(undefined);
    await draw();

    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const select = container.querySelector('.report-reason-select') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'hate');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const textarea = container.querySelector('.feedback-input') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, '  a slur is on the title screen  ');
    });

    const submit = container.querySelector('.feedback-actions button') as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(reportApi.submitGameReport).toHaveBeenCalledWith('brick-storm', 'hate', 'a slur is on the title screen');
    expect(container.querySelector('.feedback-sent')).not.toBeNull();
  });

  it('shows a rate-limit message on a 429', async () => {
    authState.user = { uid: 'g:me' };
    const limited = Object.assign(new Error('too many reports'), { status: 429 });
    reportApi.submitGameReport.mockRejectedValue(limited);
    await draw();

    await act(async () => {
      toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.feedback-input') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'this game is not okay');
    });

    const submit = container.querySelector('.feedback-actions button') as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toMatch(/try again later/i);
  });
});
