// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorControllerState } from '../../editorBridge.js';
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

const L = (en: string, pl: string) => ({ en, pl });

const definition: EditorDefinition = {
  version: 1,
  content: {
    cards: {
      widget: 'collection',
      label: L('Cards', 'Karty'),
      itemLabel: L('Card', 'Karta'),
      min: 0,
      max: 4,
      defaults: [],
      item: {
        widget: 'entities',
        properties: { name: { type: 'text', max: 20 }, cost: { type: 'int', min: 0, max: 9 } },
        constraints: [],
      },
    },
  },
  controller: true,
};

const editorState: GameEditorState = {
  version: 'v1',
  definition,
  content: { cards: [{ properties: { name: 'Ace', cost: 1 } }] },
  draft: null,
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Cards',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'cards',
};

function controllerState(overrides: Partial<EditorControllerState> = {}): EditorControllerState {
  return {
    status: 'ready',
    view: { type: 'rail', children: [{ type: 'toolbar', tools: ['paint'] }] } as EditorControllerState['view'],
    reason: null,
    selected: null,
    pendingChange: null,
    uiRequest: null,
    checks: null,
    checksFresh: true,
    canvasBox: null,
    sendEvent: vi.fn(),
    sendSelection: vi.fn(),
    sendUiResult: vi.fn(),
    acknowledgeChange: vi.fn(),
    useFallback: vi.fn(),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  fetchGameEditor.mockResolvedValue(editorState);
  putEditorDraft.mockResolvedValue({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
  publishEditorContent.mockResolvedValue({ version: 'v2-editor', jobId: 42 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

describe('a controller replacement that skipped mergeDraft', () => {
  it('still renders the item list and properties when properties is null', async () => {
    const controller = controllerState();
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} controller={controller} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={{
            ...controller,
            pendingChange: { id: 'change-null-props', patch: { content: { cards: [{ properties: null }] } } },
          }}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => container.querySelector<HTMLButtonElement>('.editor-surface-switch')!.click());

    const itemButton = [...container.querySelectorAll<HTMLButtonElement>('.editor-item-list button')].find(
      (button) => !button.classList.contains('editor-item-remove'),
    );
    expect(itemButton?.textContent).toContain('Card 1');
    expect(container.querySelector('.editor-prop')).not.toBeNull();
  });
});
