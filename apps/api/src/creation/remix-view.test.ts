import { describe, expect, it } from 'vitest';
import { remixClientPayload } from './remix-view.js';
import type { EditorDefinition } from './editor-contract.js';

const definition: EditorDefinition = {
  version: 1,
  params: {
    speed: { type: 'number', min: 1, max: 3, default: 1, label: { en: 'Speed', pl: 'Prędkość' } },
  },
  content: {},
};

describe('remixClientPayload', () => {
  it('sends declaration, defaults, and lanes without resume extras', () => {
    const body = remixClientPayload({
      remixId: 'r1',
      definition,
      contentDefaults: {},
      canAssist: true,
      canCode: false,
      expiresInMs: 60_000,
    });
    expect(body).toMatchObject({
      remixId: 'r1',
      values: { speed: 1 },
      canAssist: true,
      canCode: false,
      expiresInMs: 60_000,
    });
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('undoable');
    expect(body).not.toHaveProperty('turns');
  });

  it('includes resume fields only when they carry something', () => {
    const body = remixClientPayload({
      remixId: 'r1',
      definition: null,
      contentDefaults: {},
      canAssist: false,
      canCode: true,
      expiresInMs: 10,
      html: '<html></html>',
      undoable: true,
      turns: [{ utterance: 'faster', summary: 'Raised speed.' }],
    });
    expect(body.html).toBe('<html></html>');
    expect(body.undoable).toBe(true);
    expect(body.turns).toEqual([{ utterance: 'faster', summary: 'Raised speed.' }]);
  });
});
