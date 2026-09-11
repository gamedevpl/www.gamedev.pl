import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';
import type { CodeLanguage } from './codeTokens.js';

export function languageExtension(language: CodeLanguage): Extension | null {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true });
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    case 'markdown':
      return markdown();
    default:
      return null;
  }
}
