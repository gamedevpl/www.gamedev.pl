// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorDefinition, GameEditorState, StudioGame } from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

import { EditorPanel } from './EditorPanel.js';

const label = { en: 'Width', pl: 'Szerokość' };
const definition: EditorDefinition = {
  version: 1,
  params: { width: { type: 'int', min: 80, max: 200, label, default: 140 } },
  content: {},
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Lemming Rescue',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'lemming-rescue',
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  putEditorDraft.mockResolvedValue({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
  publishEditorContent.mockResolvedValue({ version: 'v2-editor', jobId: 42 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

describe('Publish checks param and property values', () => {
  it('holds Publish when a kept param no longer fits the declaration', async () => {
    const editorState: GameEditorState = {
      version: 'v1',
      definition,
      content: { params: { width: 140 } },
      draft: { content: { params: { width: 12 } }, revision: 3, updatedAt: '' },
    };
    fetchGameEditor.mockResolvedValue(editorState);
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    const publish = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(i18n.t('studioPanel.editor.publish')),
    );
    expect(publish?.disabled).toBe(true);
    expect(container.textContent).toContain('80-200');
    expect(container.querySelector('.editor-prop.is-invalid')).not.toBeNull();
  });

  it('marks a missing or null param invalid instead of scoring the default', async () => {
    const editorState: GameEditorState = {
      version: 'v1',
      definition,
      content: { params: { width: 140 } },
      draft: {
        content: { params: { width: null } } as unknown as GameEditorState['content'],
        revision: 4,
        updatedAt: '',
      },
    };
    fetchGameEditor.mockResolvedValue(editorState);
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    expect(container.querySelector('.editor-prop.is-invalid')).not.toBeNull();
    const publish = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(i18n.t('studioPanel.editor.publish')),
    );
    expect(publish?.disabled).toBe(true);
  });
});
