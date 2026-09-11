import { describe, expect, it } from 'vitest';
import { commandSuggestions } from './completion.js';
import { SLASH_VERBS } from '../argv.js';

describe('command suggestions', () => {
  it('covers every verb and session controls with descriptions', () => {
    const all = commandSuggestions('/');
    for (const verb of [...SLASH_VERBS, 'retry', 'quit', 'exit']) {
      expect(all).toContainEqual({ command: `/${verb}`, description: expect.any(String) });
    }
  });
  it('filters the command name, not prose or arguments', () => {
    expect(commandSuggestions('/PU').map((item) => item.command)).toEqual(['/pull', '/push']);
    for (const draft of ['', 'play', 'please /pu', '/play airtime', '/play ', '/unknown']) {
      expect(commandSuggestions(draft)).toEqual([]);
    }
  });
});
