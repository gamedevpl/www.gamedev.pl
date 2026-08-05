// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSpecBlocks } from './specBlocks.js';
import { SpecMarkdown } from './SpecMarkdown.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function render(markdown: string) {
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SpecMarkdown, { markdown }));
  });
}

describe('SpecMarkdown', () => {
  it('renders the SPEC dialect: headings, paragraphs, lists, code, rules', () => {
    render(
      [
        '# Title',
        '',
        'A paragraph with **bold**, *italic* and `code`.',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '2. second',
        '',
        '---',
        '',
        '```',
        'const x = 1;',
        '```',
      ].join('\n'),
    );

    // `#` shifts down so the page's own chrome keeps the outline.
    expect(container.querySelector('h3')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('p code')?.textContent).toBe('code');
    expect(Array.from(container.querySelectorAll('ul li')).map((li) => li.textContent)).toEqual(['one', 'two']);
    expect(Array.from(container.querySelectorAll('ol li')).map((li) => li.textContent)).toEqual(['first', 'second']);
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });

  it('renders raw HTML as visible text, never as markup', () => {
    render('Hello <img src=x onerror=alert(1)> and <script>alert(2)</script>');

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('links http(s) targets only, with a nofollow noopener rel', () => {
    render('See [docs](https://example.com/x) and [bad](javascript:alert(1)).');

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://example.com/x');
    expect(anchor?.getAttribute('rel')).toBe('nofollow noopener noreferrer');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    // The javascript: form never becomes a token, so it stays literal text.
    expect(container.querySelectorAll('a').length).toBe(1);
    expect(container.textContent).toContain('[bad](javascript:alert(1))');
  });
});

describe('parseSpecBlocks', () => {
  it('finds the first paragraph for the page description', () => {
    const blocks = parseSpecBlocks('# T\n\nThe description.\n\n## More\n\ntext');
    const paragraph = blocks.find((block) => block.kind === 'paragraph');
    expect(paragraph).toEqual({ kind: 'paragraph', text: 'The description.' });
  });

  it('survives an unclosed code fence', () => {
    expect(parseSpecBlocks('```\nunclosed')).toEqual([{ kind: 'code', text: 'unclosed' }]);
  });
});
