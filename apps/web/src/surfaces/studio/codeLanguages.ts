import type { CodeLanguage } from './codeTokens.js';

export function languageFor(path: string): CodeLanguage {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

export function isTsPath(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}
