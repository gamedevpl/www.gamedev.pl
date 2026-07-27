// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const contactApi = vi.hoisted(() => ({
  submitContact: vi.fn(),
}));
vi.mock('./contactApi.js', () => contactApi);

import { ContactPage } from './ContactPage.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  contactApi.submitContact.mockReset();
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

async function draw(onBack = () => {}): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(<ContactPage onBack={onBack} />);
  });
}

function typeIntoInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function typeIntoTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ContactPage', () => {
  it('renders the form fields and a mailto fallback', async () => {
    await draw();

    expect(container.querySelector('input[name="name"]')).toBeTruthy();
    expect(container.querySelector('input[name="email"]')).toBeTruthy();
    expect(container.querySelector('textarea[name="message"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:admin@gamedev.pl"]')?.textContent).toBe('admin@gamedev.pl');
  });

  it('submits the form and shows a confirmation', async () => {
    contactApi.submitContact.mockResolvedValue(undefined);
    await draw();

    await act(async () => {
      typeIntoInput(container.querySelector('input[name="name"]') as HTMLInputElement, 'Ada');
      typeIntoInput(container.querySelector('input[name="email"]') as HTMLInputElement, 'ada@example.com');
      typeIntoTextarea(
        container.querySelector('textarea[name="message"]') as HTMLTextAreaElement,
        'Hello, I have a question about the beta access.',
      );
    });

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(contactApi.submitContact).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello, I have a question about the beta access.',
    });
    expect(container.textContent).toMatch(/on its way|sent|thank/i);
  });

  it('keeps the submit button disabled below the message minimum', async () => {
    await draw();
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      typeIntoInput(container.querySelector('input[name="name"]') as HTMLInputElement, 'Ada');
      typeIntoInput(container.querySelector('input[name="email"]') as HTMLInputElement, 'ada@example.com');
      typeIntoTextarea(container.querySelector('textarea[name="message"]') as HTMLTextAreaElement, 'too short');
    });

    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
