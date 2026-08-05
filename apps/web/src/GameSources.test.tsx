// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { tokenizeLine } from './codeTokens.js';

const fetchGameSources = vi.fn();
const fetchGameSourceFile = vi.fn();

vi.mock('./gameSourcesApi.js', () => ({
  fetchGameSources: (...args: unknown[]) => fetchGameSources(...args),
  fetchGameSourceFile: (...args: unknown[]) => fetchGameSourceFile(...args),
}));

import { GameSources } from './GameSources.js';

const LISTING = {
  version: 'v-live',
  files: [
    { path: 'GAME.json', bytes: 120, language: 'json' as const },
    { path: 'game.ts', bytes: 2048, language: 'typescript' as const },
    { path: 'SPEC.md', bytes: 800, language: 'markdown' as const },
  ],
  totalBytes: 2968,
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  fetchGameSources.mockReset();
  fetchGameSourceFile.mockReset();
  fetchGameSources.mockResolvedValue(LISTING);
  fetchGameSourceFile.mockResolvedValue({
    path: 'game.ts',
    version: 'v-live',
    bytes: 2048,
    language: 'typescript',
    content: 'const speed = 1; // go\nexport function run() {\n  return "<b>hi</b>";\n}',
  });
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

async function renderSources() {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GameSources, { slug: 'neon-courier' }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('GameSources', () => {
  it('lists every file and opens the game entry point first', async () => {
    await renderSources();

    const paths = Array.from(container.querySelectorAll('.game-sources-file-path')).map((el) => el.textContent);
    expect(paths).toEqual(['GAME.json', 'game.ts', 'SPEC.md']);
    // game.ts is what a curious reader wants, so it opens rather than the first row.
    expect(fetchGameSourceFile).toHaveBeenCalledWith('neon-courier', 'game.ts');
    expect(container.querySelector('.game-sources-file.is-active .game-sources-file-path')?.textContent).toBe(
      'game.ts',
    );
    expect(container.textContent).toContain('3 files');
  });

  it('renders code as numbered text, never as markup', async () => {
    await renderSources();

    const gutters = Array.from(container.querySelectorAll('.game-sources-gutter')).map((el) => el.textContent);
    expect(gutters).toEqual(['1', '2', '3', '4']);
    // The source contains HTML; it must appear as characters, not as elements.
    expect(container.querySelector('.game-sources-code b')).toBeNull();
    expect(container.querySelector('.game-sources-code')?.textContent).toContain('<b>hi</b>');
    // Highlighting happened, and did so as elements with classes.
    expect(container.querySelector('.tok-comment')?.textContent).toBe('// go');
    expect(container.querySelector('.tok-keyword')).not.toBeNull();
  });

  it('switches files on click', async () => {
    await renderSources();
    fetchGameSourceFile.mockResolvedValue({
      path: 'SPEC.md',
      version: 'v-live',
      bytes: 800,
      language: 'markdown',
      content: '# Neon Courier',
    });

    const specButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('SPEC.md'),
    );
    await act(async () => {
      specButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchGameSourceFile).toHaveBeenLastCalledWith('neon-courier', 'SPEC.md');
    expect(container.querySelector('.game-sources-code')?.textContent).toContain('# Neon Courier');
  });

  it('explains a game whose sources are not published', async () => {
    fetchGameSources.mockRejectedValue(Object.assign(new Error('not_found'), { code: 'not_found' }));
    await renderSources();

    expect(container.textContent).toContain('sources are not published');
    expect(container.querySelector('.game-sources-code')).toBeNull();
  });

  it('says when a file is too large to show', async () => {
    fetchGameSourceFile.mockRejectedValue(Object.assign(new Error('too_large'), { code: 'too_large' }));
    await renderSources();

    expect(container.textContent).toContain('too large to show');
  });
});

describe('tokenizeLine', () => {
  it('tags comments, strings, numbers and keywords in TypeScript', () => {
    expect(tokenizeLine('const x = 1; // note', 'typescript')).toEqual([
      { kind: 'keyword', text: 'const' },
      { kind: 'plain', text: ' x = ' },
      { kind: 'number', text: '1' },
      { kind: 'plain', text: '; ' },
      { kind: 'comment', text: '// note' },
    ]);
    expect(tokenizeLine('return "hi";', 'typescript')).toEqual([
      { kind: 'keyword', text: 'return' },
      { kind: 'plain', text: ' ' },
      { kind: 'string', text: '"hi"' },
      { kind: 'plain', text: ';' },
    ]);
  });

  it('separates JSON keys from values', () => {
    expect(tokenizeLine('  "title": "Neon",', 'json')).toEqual([
      { kind: 'plain', text: '  ' },
      { kind: 'key', text: '"title"' },
      { kind: 'plain', text: ': ' },
      { kind: 'string', text: '"Neon"' },
      { kind: 'plain', text: ',' },
    ]);
  });

  it('never drops or invents characters, whatever the input', () => {
    for (const language of ['typescript', 'json', 'css', 'markdown', 'text'] as const) {
      for (const line of ['', 'plain text', '</script><img src=x>', '`${a}` /* c */', '- item', '@media screen {']) {
        const tokens = tokenizeLine(line, language);
        expect(tokens.map((token) => token.text).join('')).toBe(line);
      }
    }
  });
});
