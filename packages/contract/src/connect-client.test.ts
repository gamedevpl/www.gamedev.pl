import { describe, expect, it } from 'vitest';
import { CONNECT_CLIENTS, type InstallSnippets } from './connect-client.js';

describe('CONNECT_CLIENTS', () => {
  it('lists the five clients we hand a snippet to', () => {
    expect(CONNECT_CLIENTS).toEqual(['claudeCode', 'codex', 'cursor', 'kimi', 'cli']);
  });

  it('keys InstallSnippets by exactly those clients', () => {
    const snippets: InstallSnippets = {
      claudeCode: 'a',
      codex: 'b',
      cursor: 'c',
      kimi: 'd',
      cli: 'e',
    };
    expect(Object.keys(snippets).sort()).toEqual([...CONNECT_CLIENTS].sort());
  });
});
