import { describe, expect, it } from 'vitest';
import { reconstructChatTurns } from './chat-turns-history.js';
import type { CreatorMessage } from '../platform/store.js';

function msg(text: string, origin?: CreatorMessage['origin']): CreatorMessage {
  return { id: text, text, createdAt: '2026-01-01T00:00:00.000Z', origin };
}

describe('reconstructChatTurns', () => {
  it('pairs a creator line with a studio reply', () => {
    expect(reconstructChatTurns([msg('is it done yet?'), msg('Not yet.', 'studio')])).toEqual([
      { message: 'is it done yet?', reply: 'Not yet.' },
    ]);
  });

  it('marks an unpaired creator line as a dispatched build', () => {
    expect(reconstructChatTurns([msg('make it blue')])).toEqual([{ message: 'make it blue', built: true }]);
  });

  it('pairs a creator line with a studio_ack as a build', () => {
    expect(reconstructChatTurns([msg('make it blue'), msg('On it!', 'studio_ack')])).toEqual([
      { message: 'make it blue', built: true, ackText: 'On it!' },
    ]);
  });

  it('never answers a creator line with a concept card', () => {
    const card: CreatorMessage = {
      ...msg('I sketched two directions for the next round. Tap one to see it.', 'studio'),
      proposal: { sourceRef: 's1', version: 'v1', options: [] },
    };

    // Dropped, not flushed: the ack that follows is still the answer.
    expect(reconstructChatTurns([msg('make it blue'), card, msg('On it!', 'studio_ack')])).toEqual([
      { message: 'make it blue', built: true, ackText: 'On it!' },
    ]);

    // With nothing after it, the request is still an unanswered build.
    expect(reconstructChatTurns([msg('make it blue'), card])).toEqual([{ message: 'make it blue', built: true }]);
  });

  it('keeps continue_draft paraphrases as agent turns, preferring textLocalized', () => {
    const relayed: CreatorMessage = {
      ...msg('Zoom out the battlefield.', 'agent'),
      textLocalized: 'Oddal widok pola bitwy.',
      locale: 'pl',
    };
    expect(reconstructChatTurns([relayed, msg('On it!', 'studio_ack')])).toEqual([
      { message: 'Oddal widok pola bitwy.', built: true, ackText: 'On it!', origin: 'agent' },
    ]);
  });

  it('does not treat an agent relay as words the creator typed', () => {
    expect(reconstructChatTurns([msg('make it blue'), msg('Zoom out the battlefield.', 'agent')])).toEqual([
      { message: 'make it blue', built: true },
      { message: 'Zoom out the battlefield.', built: true, origin: 'agent' },
    ]);
  });
});
