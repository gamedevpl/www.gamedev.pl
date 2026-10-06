import { describe, expect, it } from 'vitest';
import { previewStillsNote } from './preview-stills-note.js';

// The gate's own check:game output from 2026-10-05.
const failed = [
  '=== build (trenchline-command) ===',
  'Built trenchline-command',
  '=== capture (trenchline-command) ===',
  '',
  '> capture',
  '> node --import tsx tools/capture.ts trenchline-command --stills',
  '',
  'actions is not iterable',
  '',
  'capture did not complete after 5.9s — continuing.',
  'Preview stills are best effort — the lane still passed.',
].join('\n');

describe('previewStillsNote', () => {
  it('says nothing when a screenshot was stored', () => {
    expect(previewStillsNote(failed, 'media/gameplay.png')).toBe('');
  });

  it('names the capture failure the lane swallowed', () => {
    expect(previewStillsNote(failed, undefined)).toBe(
      '; no screenshot stored (capture failed: actions is not iterable) — fix CAPTURE.json, ' +
        'or the creator gets no stills or concept proposal',
    );
  });

  it('blames a plan without a capture step when the stage finished', () => {
    const quiet = '=== capture (x) ===\n> capture\nCaptured 0 stills\n';
    expect(previewStillsNote(quiet, undefined)).toContain('CAPTURE.json took no { "capture": … } step');
  });
});
