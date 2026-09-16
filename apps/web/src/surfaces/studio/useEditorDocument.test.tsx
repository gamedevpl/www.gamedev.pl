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
    await act(async () => {
      first = latest!.saveNow();
      await Promise.resolve();
    });
    act(() => latest!.setContent({ params: { name: 'fixed' } } as unknown as EditorContentDoc));
    await act(async () => {
      queued = latest!.saveNow();
      await Promise.resolve();
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

  it('serialises two waiters behind one slow write instead of racing them', async () => {
    const release: Array<(value: { revision: number; updatedAt: string }) => void> = [];
    putEditorDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(resolve);
        }),
    );
    mount();

    act(() => latest!.setContent({ params: { name: 'one' } } as unknown as EditorContentDoc));
    await act(async () => {
      void latest!.saveNow();
      await Promise.resolve();
    });
    expect(putEditorDraft).toHaveBeenCalledTimes(1);

    act(() => {
      void latest!.saveNow();
      void latest!.saveNow();
    });
    await act(async () => void (await Promise.resolve()));
    // Both are waiting on the first, so neither may have started.
    expect(putEditorDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      release[0]({ revision: 1, updatedAt: '2026-08-07T00:00:03.000Z' });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Exactly one waiter advances; without a tail they would both go now.
    expect(putEditorDraft).toHaveBeenCalledTimes(2);

    await act(async () => {
      release[1]({ revision: 2, updatedAt: '2026-08-07T00:00:04.000Z' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(putEditorDraft).toHaveBeenCalledTimes(3);
  });
});

describe('reset', () => {
  it('leaves a document the server already holds clean', () => {
    mount();
    act(() => latest!.reset({ boards: [] } as EditorContentDoc, 4));
    expect(latest!.saveState).toBe('clean');
  });

  it('marks a repaired document unsaved, so Publish flushes it before validating', () => {
    mount();
    act(() => latest!.reset({ boards: [] } as EditorContentDoc, 4, true));
    expect(latest!.saveState).toBe('dirty');
  });
});

describe('an edit made while a save is in flight', () => {
  it('leaves the document dirty, so nothing treats it as persisted', async () => {
    let finish: (value: { revision: number; updatedAt: string }) => void = () => {};
    putEditorDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();

    act(() => latest!.setContent({ params: { name: 'first' } } as unknown as EditorContentDoc));
    let inFlight: Promise<boolean> | null = null;
    await act(async () => {
      inFlight = latest!.saveNow();
      await Promise.resolve();
    });
    act(() => latest!.setContent({ params: { name: 'second' } } as unknown as EditorContentDoc));

    await act(async () => {
      finish({ revision: 3, updatedAt: '2026-08-07T00:00:03.000Z' });
      await inFlight;
    });

    expect(putEditorDraft.mock.calls[0][1]).toEqual({ params: { name: 'first' } });
    expect(latest!.saveState).toBe('dirty');
  });

  it('still reports saved when nothing changed while it was in flight', async () => {
    let finish: (value: { revision: number; updatedAt: string }) => void = () => {};
    putEditorDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();

    act(() => latest!.setContent({ params: { name: 'only' } } as unknown as EditorContentDoc));
    let inFlight: Promise<boolean> | null = null;
    await act(async () => {
      inFlight = latest!.saveNow();
      await Promise.resolve();
    });

    await act(async () => {
      finish({ revision: 4, updatedAt: '2026-08-07T00:00:04.000Z' });
      await inFlight;
    });

    expect(latest!.saveState).toBe('saved');
  });
});
