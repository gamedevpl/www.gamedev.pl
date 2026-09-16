import { describe, expect, it } from 'vitest';
import { editorContentMessage } from './editorBridge.js';

describe('editor content bridge payload', () => {
  it('omits selection when the shell has not named an item', () => {
    expect(editorContentMessage({ params: { width: 1 } })).toEqual({
      ns: 'gdp',
      v: 1,
      t: 'editor:content',
      content: { params: { width: 1 } },
    });
  });

  it('names the selected collection item so the preview can open it', () => {
    expect(editorContentMessage({ maps: [] }, { collection: 'maps', index: 15 })).toEqual({
      ns: 'gdp',
      v: 1,
      t: 'editor:content',
      content: { maps: [] },
      selection: { collection: 'maps', index: 15 },
    });
  });
});
