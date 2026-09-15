// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorContentDoc } from '../../studioApi.js';

const putEditorDraft = vi.hoisted(() => vi.fn());
vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, putEditorDraft };
});
vi.mock('../../visitTelemetry.js', () => ({ recordEditorStep: vi.fn() }));

import { useEditorDocument } from './useEditorDocument.js';

type Document = ReturnType<typeof useEditorDocument>;
let latest: Document | null = null;

function Harness() {
  latest = useEditorDocument({ slug: 'garden-gather' });
  return null;
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  latest = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

function mount() {
  root = createRoot(container);
  act(() => root!.render(<Harness />));
}

describe('a save that queues behind another still sends its own snapshot', () => {
  it('writes the corrected content even though the write ahead of it failed', async () => {
    let failFirst: (error: Error) => void = () => {};
    putEditorDraft
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failFirst = reject;
          }),
      )
      .mockResolvedValue({ revision: 2, updatedAt: '2026-08-07T00:00:02.000Z' });
    mount();

    act(() => latest!.setContent({ params: { name: 'bad' } } as unknown as EditorContentDoc));
    let first: Promise<boolean> | null = null;
    let queued: Promise<boolean> | null = null;
    act(() => {
      first = latest!.saveNow();
    });
    act(() => latest!.setContent({ params: { name: 'fixed' } } as unknown as EditorContentDoc));
    act(() => {
      queued = latest!.saveNow();
    });

    await act(async () => {
      failFirst(Object.assign(new Error('moderation'), { status: 422, problems: ['no'] }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await first;
    await queued;

    // That failure was the first snapshot's; this one still goes.
    expect(putEditorDraft).toHaveBeenCalledTimes(2);
    expect(putEditorDraft.mock.calls[1][1]).toEqual({ params: { name: 'fixed' } });
  });
});
