// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_COMPOSER_ATTACHMENTS,
  useComposerAttachments,
  type ComposerAttachmentsApi,
} from './composerAttachments.js';

let api: ComposerAttachmentsApi;

function Host() {
  api = useComposerAttachments(false);
  return null;
}

async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Host />);
  });
}

// The fetch/blob/FileReader chain settles over several turns, not one.
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Resolves only when the caller aborts, the way a hung request behaves.
function hangingFetch(signal?: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

function pngResponse(): Response {
  return { ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) } as Response;
}

describe('useComposerAttachments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases Send when a slow pick is superseded, instead of waiting for it', async () => {
    const calls: (AbortSignal | undefined)[] = [];
    vi.mocked(fetch).mockImplementation((_url, init) => {
      calls.push(init?.signal ?? undefined);
      return calls.length === 1 ? hangingFetch(init?.signal ?? undefined) : Promise.resolve(pngResponse());
    });
    await mount();

    await act(async () => {
      api.addAttachmentFromUrl('A', '/shot/a', { replaces: 'proposal' });
    });
    await settle();
    expect(api.pendingAttachmentReads).toBe(1);

    await act(async () => {
      api.addAttachmentFromUrl('B', '/shot/b', { replaces: 'proposal' });
    });
    await settle();

    // The first request was aborted, so it no longer holds Send disabled.
    expect(api.pendingAttachmentReads).toBe(0);
    expect(api.attachments.map((item) => item.name)).toEqual(['B']);
  });

  it('says so rather than dropping the frame when the composer is full', async () => {
    vi.mocked(fetch).mockResolvedValue(pngResponse());
    await mount();
    await act(async () => {
      for (let index = 0; index < MAX_COMPOSER_ATTACHMENTS; index += 1) {
        api.handleSaveSketch(`data:image/png;base64,S${index}`);
      }
    });

    await act(async () => {
      api.addAttachmentFromUrl('AI concept', '/shot/a', { replaces: 'proposal' });
    });
    await settle();

    expect(api.blockedAttachment?.name).toBe('AI concept');
    expect(api.attachments).toHaveLength(MAX_COMPOSER_ATTACHMENTS);
    expect(api.attachments.some((item) => item.name === 'AI concept')).toBe(false);
  });

  it('attaches the waiting frame once the creator makes room', async () => {
    vi.mocked(fetch).mockResolvedValue(pngResponse());
    await mount();
    await act(async () => {
      for (let index = 0; index < MAX_COMPOSER_ATTACHMENTS; index += 1) {
        api.handleSaveSketch(`data:image/png;base64,S${index}`);
      }
    });
    await act(async () => {
      api.addAttachmentFromUrl('AI concept', '/shot/a', { replaces: 'proposal' });
    });
    await settle();
    expect(api.blockedAttachment?.name).toBe('AI concept');

    await act(async () => {
      api.removeAttachment(api.attachments[0]!.id);
    });

    // The notice asked for room; making it must attach the frame.
    expect(api.blockedAttachment).toBeNull();
    expect(api.attachments.some((item) => item.name === 'AI concept')).toBe(true);
  });

  it('leaves no stale frame behind when a repick fails to load', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pngResponse())
      .mockResolvedValue({ ok: false } as Response);
    await mount();
    await act(async () => {
      api.addAttachmentFromUrl('A', '/shot/a', { replaces: 'proposal' });
    });
    await settle();
    expect(api.attachments.map((item) => item.name)).toEqual(['A']);

    await act(async () => {
      api.addAttachmentFromUrl('B', '/shot/b', { replaces: 'proposal' });
    });
    await settle();

    // B's prompt is in the composer; A's frame answers another.
    expect(api.attachments).toEqual([]);
    expect(api.blockedAttachment).toEqual({ name: 'B', dataUrl: null });
  });
});
