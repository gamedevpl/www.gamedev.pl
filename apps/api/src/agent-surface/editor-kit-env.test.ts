import { describe, expect, it } from 'vitest';
import { editorKitV2Enabled } from './editor-kit-env.js';

describe('EditorKit v2 flag', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(editorKitV2Enabled({})).toBe(false);
    expect(editorKitV2Enabled({ EDITORKIT_V2: 'true' })).toBe(true);
    expect(editorKitV2Enabled({ EDITORKIT_V2: '1' })).toBe(true);
    expect(editorKitV2Enabled({ EDITORKIT_V2: 'false' })).toBe(false);
  });
});
