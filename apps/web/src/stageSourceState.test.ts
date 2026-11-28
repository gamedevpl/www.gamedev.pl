import { describe, expect, it } from 'vitest';
import { resolveStageSourceState } from './stageSourceState.js';
import type { SubmissionStatus } from './submissionApi.js';

const DRAFT_STATUS = { status: 'building', slug: 'cozycraft' } as unknown as SubmissionStatus;
const PUBLISHED_STATUS = { status: 'published', slug: 'cozycraft' } as unknown as SubmissionStatus;

describe('resolveStageSourceState', () => {
  it('leaves orientation undefined when a newer channel build supersedes preview', () => {
    const out = resolveStageSourceState({
      status: DRAFT_STATUS,
      selectedPreviewVersion: null,
      preview: { html: '<p>preview</p>', at: 100, version: 'v1', orientation: 'landscape' },
      versionPreview: null,
      channel: { html: '<p>channel</p>', at: 200, label: 'c1', seed: false },
      published: { html: '<p>published</p>', slug: 'cozycraft', orientation: 'portrait' },
    });

    expect(out.rawHtml).toBe('<p>channel</p>');
    expect(out.orientation).toBeUndefined();
  });

  it('does not borrow published orientation when the selected draft preview omits one', () => {
    const out = resolveStageSourceState({
      status: DRAFT_STATUS,
      selectedPreviewVersion: null,
      preview: { html: '<p>draft-any</p>', at: 200, version: 'v2' },
      versionPreview: null,
      channel: null,
      published: { html: '<p>published</p>', slug: 'cozycraft', orientation: 'landscape' },
    });

    expect(out.rawHtml).toBe('<p>draft-any</p>');
    expect(out.orientation).toBeUndefined();
  });

  it('uses orientation from whichever document is actually selected', () => {
    const previewOut = resolveStageSourceState({
      status: DRAFT_STATUS,
      selectedPreviewVersion: null,
      preview: { html: '<p>draft-land</p>', at: 200, version: 'v2', orientation: 'landscape' },
      versionPreview: null,
      channel: null,
      published: { html: '<p>published</p>', slug: 'cozycraft', orientation: 'portrait' },
    });
    expect(previewOut.rawHtml).toBe('<p>draft-land</p>');
    expect(previewOut.orientation).toBe('landscape');

    const publishedOut = resolveStageSourceState({
      status: PUBLISHED_STATUS,
      selectedPreviewVersion: null,
      preview: { html: '<p>draft</p>', at: 200, version: 'v2', orientation: 'portrait' },
      versionPreview: null,
      channel: null,
      published: { html: '<p>published</p>', slug: 'cozycraft', orientation: 'landscape' },
    });
    expect(publishedOut.rawHtml).toBe('<p>published</p>');
    expect(publishedOut.orientation).toBe('landscape');
  });
});
