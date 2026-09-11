// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type {
  EditorCollectionSpec,
  EditorContentDoc,
  EditorConstraint,
  EditorDefinition,
  EditorItemContent,
  GameEditorState,
  StudioGame,
} from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

import { EditorPanel } from './EditorPanel.js';
import { RemixPainter } from '../../RemixPainter.js';
import type { EditorContentPush } from '../../editorBridge.js';

const mapItem: EditorItemContent = { properties: { name: 'Map 1' }, rows: ['..', '..'] };
const routeItem: EditorItemContent = { properties: { name: 'Route 1' }, rows: ['##', '##'] };

function collection(
  label: string,
  itemLabel: string,
  tileChar: string,
  item: EditorItemContent,
  constraints: EditorConstraint[] = [],
): EditorCollectionSpec {
  return {
    widget: 'collection',
    label: { en: label, pl: `${label} PL` },
    itemLabel: { en: itemLabel, pl: `${itemLabel} PL` },
    min: 1,
    max: 2,
    item: {
      widget: 'tilemap',
      grid: { minCols: 2, maxCols: 2, minRows: 2, maxRows: 2 },
      tiles: [
        { key: 'floor', char: tileChar, label: { en: 'Floor', pl: 'Podłoga' } },
        { key: 'wall', char: tileChar === '.' ? '#' : '.', label: { en: 'Wall', pl: 'Ściana' } },
      ],
      properties: { name: { type: 'text', max: 40 } },
      constraints,
    },
    defaults: [item],
  };
}

const definition: EditorDefinition = {
  version: 1,
  content: {
    maps: collection('Maps', 'Map', '.', mapItem),
    routes: collection('Routes', 'Route', '#', routeItem, [{ tile: 'floor', min: 5 }]),
  },
};

const content = { maps: [mapItem], routes: [routeItem] };

const layeredDefinition: EditorDefinition = {
  version: 2,
  content: {},
  layers: {
    terrain: {
      widget: 'tilemap',
      label: { en: 'Terrain', pl: 'Teren' },
      grid: { minCols: 3, maxCols: 3, minRows: 3, maxRows: 3 },
      tiles: [
        { key: 'floor', char: '.', label: { en: 'Floor', pl: 'Podłoga' } },
        { key: 'start', char: '@', label: { en: 'Start', pl: 'Start' } },
        { key: 'goal', char: '*', label: { en: 'Goal', pl: 'Meta' } },
      ],
      properties: {},
      constraints: [],
    },
    objects: {
      widget: 'tilemap',
      label: { en: 'Objects', pl: 'Obiekty' },
      grid: { minCols: 3, maxCols: 3, minRows: 3, maxRows: 3 },
      tiles: [
        { key: 'empty', char: '.', label: { en: 'Empty', pl: 'Puste' } },
        { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Ściana' } },
      ],
      properties: {},
      constraints: [],
    },
    triggers: {
      widget: 'entities',
      label: { en: 'Triggers', pl: 'Wyzwalacze' },
      min: 0,
      max: 2,
      properties: { kind: { type: 'text', max: 20 } },
      constraints: [],
    },
  },
  constraints: [
    {
      reachable: {
        from: { layer: 'terrain', tile: 'start' },
        blockedBy: [{ layer: 'objects', tile: 'wall' }],
        require: [{ layer: 'terrain', tile: 'goal' }],
      },
    },
  ],
};

const layeredContent: EditorContentDoc = {
  layers: {
    terrain: { properties: {}, rows: ['...', '.@*', '...'] },
    objects: { properties: {}, rows: ['...', '...', '...'] },
    triggers: [{ properties: { kind: 'exit' } }],
  },
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Fixture game',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'fixture-game',
};

function editorState(overrides: Partial<GameEditorState> = {}): GameEditorState {
  return { version: 'v1', definition, content, draft: null, ...overrides };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  fetchGameEditor.mockResolvedValue(editorState());
  putEditorDraft.mockResolvedValue({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
  publishEditorContent.mockResolvedValue({ version: 'v2-editor', jobId: 42 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

async function renderEditor() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function changeSelect(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('multi-collection editor surfaces', () => {
  it('switches the studio item list and painter without changing draft state', async () => {
    await renderEditor();

    const selector = container.querySelector('.editor-collection-selector select') as HTMLSelectElement;
    expect(selector).not.toBeNull();
    expect(selector.value).toBe('maps');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Map 1');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(true);

    changeSelect(selector, 'routes');

    expect(selector.value).toBe('routes');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Route 1');
    expect(container.querySelector('.editor-item-list')?.textContent).not.toContain('Map 1');
    expect(putEditorDraft).not.toHaveBeenCalled();
  });

  it('switches the remix painter collection and leaves the document untouched', async () => {
    const onChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<RemixPainter content={definition.content} doc={content} onChange={onChange} />);
    });

    const selector = container.querySelector('.editor-collection-selector select') as HTMLSelectElement;
    expect(selector.value).toBe('maps');
    expect(container.querySelector('.remix-painter-items')?.textContent).toContain('Map 1');

    changeSelect(selector, 'routes');

    expect(selector.value).toBe('routes');
    expect(container.querySelector('.remix-painter-items')?.textContent).toContain('Route 1');
    expect(container.querySelector('.remix-painter-items')?.textContent).not.toContain('Map 1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the single-collection surfaces free of selector chrome', async () => {
    const single = { maps: definition.content.maps };
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: { version: 1, content: single }, content: { maps: [mapItem] } }),
    );
    await renderEditor();
    expect(container.querySelector('.editor-collection-selector')).toBeNull();

    act(() => {
      root!.render(<RemixPainter content={single} doc={{ maps: [mapItem] }} onChange={vi.fn()} />);
    });
    expect(container.querySelector('.editor-collection-selector')).toBeNull();
  });
});

describe('layered editor surfaces', () => {
  it('renders a stacked Studio board with a declaration-driven layer rail', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ definition: layeredDefinition, content: layeredContent }));
    await renderEditor();

    expect(container.querySelectorAll('.editor-layer-board')).toHaveLength(2);
    expect(container.querySelectorAll('.editor-layer-picker-item')).toHaveLength(3);
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Terrain');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(false);

    const objects = Array.from(container.querySelectorAll('.editor-layer-picker-item')).find((button) =>
      button.textContent?.includes('Objects'),
    ) as HTMLButtonElement;
    await act(async () => objects.click());
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Objects');
    expect(putEditorDraft).not.toHaveBeenCalled();
  });

  it('renders Remix layers stacked and keeps lower layers read-only', async () => {
    const onChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter
          layers={layeredDefinition.layers}
          constraints={layeredDefinition.constraints}
          doc={layeredContent}
          onChange={onChange}
        />,
      );
    });

    expect(container.querySelectorAll('.editor-layer-board')).toHaveLength(2);
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Triggers');
    const terrain = Array.from(container.querySelectorAll('.editor-layer-picker-item')).find((button) =>
      button.textContent?.includes('Terrain'),
    ) as HTMLButtonElement;
    await act(async () => terrain.click());
    expect(container.textContent).toContain('Only the top layer can be edited');
    expect(container.querySelector<HTMLButtonElement>('.editor-layer-board.is-active button')?.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('selected collection item reaches the preview', () => {
  const mapTwo: EditorItemContent = { properties: { name: 'Map 2' }, rows: ['##', '##'] };
  const twoMaps = { maps: [mapItem, mapTwo], routes: [routeItem] };

  it('studio item picks push the selected collection index without writing a draft', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ content: twoMaps }));
    const push = vi.fn();
    const editorPushRef = { current: push as EditorContentPush };
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} editorPushRef={editorPushRef} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    push.mockClear();

    const items = container.querySelectorAll('.editor-item-list button');
    const second = Array.from(items).find((button) => button.textContent === 'Map 2') as HTMLButtonElement;
    expect(second).not.toBeUndefined();
    await act(async () => {
      second.click();
    });

    expect(push).toHaveBeenCalledWith(twoMaps, { collection: 'maps', index: 1 });
    expect(putEditorDraft).not.toHaveBeenCalled();
  });

  it('remix painter reports the selected item when the player switches maps', async () => {
    const onChange = vi.fn();
    const onSelectionChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter
          content={definition.content}
          doc={twoMaps}
          onChange={onChange}
          onSelectionChange={onSelectionChange}
        />,
      );
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({ collection: 'maps', index: 0 });

    const second = Array.from(container.querySelectorAll('.remix-painter-item')).find(
      (button) => button.textContent === 'Map 2',
    ) as HTMLButtonElement;
    await act(async () => {
      second.click();
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({ collection: 'maps', index: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the entities widget', () => {
  const cardOne: EditorItemContent = { properties: { name: 'Strike', cost: 1 } };
  const cardTwo: EditorItemContent = { properties: { name: 'Guard', cost: 2 } };

  const entitiesDefinition: EditorDefinition = {
    version: 1,
    content: {
      cards: {
        widget: 'collection',
        label: { en: 'Cards', pl: 'Karty' },
        itemLabel: { en: 'Card', pl: 'Karta' },
        min: 1,
        max: 4,
        item: {
          widget: 'entities',
          properties: { name: { type: 'text', max: 24 }, cost: { type: 'int', min: 0, max: 3 } },
          constraints: [{ uniqueBy: 'cost' }],
        },
        defaults: [cardOne, cardTwo],
      },
    },
  };

  it('renders properties without a board, and passes checks when values are unique', async () => {
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, cardTwo] } }),
    );
    await renderEditor();

    expect(container.querySelector('.editor-board')).toBeNull();
    expect(container.querySelector('.editor-palette')).toBeNull();
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Strike');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Guard');
    expect(container.textContent).toContain('cost');
    expect(container.querySelector('.editor-check.is-ok')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(false);
  });

  it('clicking Publish carries the slug through to the API and shows the published banner', async () => {
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, cardTwo] } }),
    );
    await renderEditor();

    const publishButton = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary');
    expect(publishButton?.disabled).toBe(false);
    await act(async () => {
      publishButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(publishEditorContent).toHaveBeenCalledWith('fixture-game');
    expect(container.querySelector('.editor-banner.is-ok')?.textContent).toContain(
      i18n.t('studioPanel.editor.published'),
    );
  });

  it('flags a duplicate uniqueBy value and blocks publish', async () => {
    const duplicateCard: EditorItemContent = { properties: { name: 'Guard 2', cost: 1 } };
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, duplicateCard] } }),
    );
    await renderEditor();

    expect(container.querySelector('.editor-check.is-bad')?.textContent).toContain('cost');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(true);
  });

  it('remix painter lets a remixer edit entity properties and see uniqueBy checks (no board)', async () => {
    const onChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter content={entitiesDefinition.content} doc={{ cards: [cardOne, cardTwo] }} onChange={onChange} />,
      );
    });
    expect(container.querySelector('.editor-board')).toBeNull();
    expect(container.querySelector('.editor-palette')).toBeNull();
    expect(container.querySelector('.remix-painter-items')?.textContent).toContain('Strike');

    // Strike's "cost" field is editable, not just displayed.
    const costInput = container.querySelector<HTMLInputElement>('.remix-painter-properties input[type="number"]');
    expect(costInput).not.toBeNull();
    expect(costInput!.value).toBe('1');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(costInput, '2');
      costInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({
      cards: [{ properties: { name: 'Strike', cost: 2 } }, cardTwo],
    });

    // Collides with Guard's cost (2) — the uniqueBy check must surface here too.
    act(() => root!.unmount());
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter
          content={entitiesDefinition.content}
          doc={{ cards: [{ properties: { name: 'Strike', cost: 2 } }, cardTwo] }}
          onChange={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('.remix-painter-checks .editor-check.is-bad')?.textContent).toContain('cost');
  });
});

describe('the path widget', () => {
  const pathItem: EditorItemContent = {
    properties: { name: 'Starter' },
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  };
  const pathDefinition: EditorDefinition = {
    version: 1,
    content: {
      routes: {
        widget: 'collection',
        label: { en: 'Routes', pl: 'Trasy' },
        itemLabel: { en: 'Route', pl: 'Trasa' },
        min: 1,
        max: 3,
        item: {
          widget: 'path',
          gridCols: 4,
          gridRows: 3,
          minPoints: 2,
          maxPoints: 8,
          closed: false,
          properties: { name: { type: 'text', max: 24 } },
        },
        defaults: [pathItem],
      },
    },
  };

  it('edits a Studio path with the required keyboard controls', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ definition: pathDefinition, content: { routes: [pathItem] } }));
    const push = vi.fn();
    const editorPushRef = { current: push as EditorContentPush };
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} editorPushRef={editorPushRef} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    push.mockClear();

    const painter = container.querySelector<SVGSVGElement>('.editor-path');
    expect(painter).not.toBeNull();
    expect(container.textContent).toContain('arrows move the cursor');
    act(() => {
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(push.mock.lastCall?.[0].routes[0].points).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);

    act(() => {
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(push.mock.lastCall?.[0].routes[0].points).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('lets Remix append by click and drag an existing point', async () => {
    const onChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(<RemixPainter content={pathDefinition.content} doc={{ routes: [pathItem] }} onChange={onChange} />);
    });
    let painter = container.querySelector<SVGSVGElement>('.editor-path')!;
    vi.spyOn(painter, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });
    act(() => painter.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 250, clientY: 150 })));
    const appended = onChange.mock.lastCall?.[0] as { routes: EditorItemContent[] };
    expect(appended.routes[0]).toMatchObject({
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    });

    await act(async () => {
      root!.render(<RemixPainter content={pathDefinition.content} doc={appended} onChange={onChange} />);
    });
    painter = container.querySelector<SVGSVGElement>('.editor-path')!;
    vi.spyOn(painter, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });
    const firstHit = container.querySelector<SVGCircleElement>('[data-point-index="0"] .editor-path-point-hit')!;
    act(() => {
      firstHit.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 150 }));
      painter.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 350, clientY: 250 }));
      painter.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 350, clientY: 250 }));
      painter.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 350, clientY: 250 }));
    });
    expect(onChange.mock.lastCall?.[0].routes[0].points).toEqual([
      { x: 3, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('keeps extreme path grids large enough to edit inside a scrolling viewport', async () => {
    const extremeDefinition: EditorDefinition = {
      version: 1,
      content: {
        routes: {
          widget: 'collection',
          label: { en: 'Routes', pl: 'Trasy' },
          itemLabel: { en: 'Route', pl: 'Trasa' },
          min: 1,
          max: 3,
          item: {
            widget: 'path',
            gridCols: 64,
            gridRows: 1,
            minPoints: 2,
            maxPoints: 8,
            closed: false,
            properties: { name: { type: 'text', max: 24 } },
          },
          defaults: [pathItem],
        },
      },
    };
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter content={extremeDefinition.content} doc={{ routes: [pathItem] }} onChange={vi.fn()} />,
      );
    });

    const viewport = container.querySelector('.editor-path-viewport');
    const painter = container.querySelector<SVGSVGElement>('.editor-path');
    expect(viewport).not.toBeNull();
    expect(painter?.style.getPropertyValue('--editor-path-fit-width')).toBe('620px');
    expect(painter?.style.getPropertyValue('--editor-path-min-width')).toBe('1536px');
    expect(painter?.style.getPropertyValue('--editor-path-min-height')).toBe('24px');
    expect(painter?.style.getPropertyValue('--editor-path-aspect')).toBe('64 / 1');
    const point = painter?.querySelector('.editor-path-point');
    expect(point?.querySelector('.editor-path-point-hit')?.getAttribute('r')).toBe('0.6');
    expect(point?.querySelector('.editor-path-point-dot')?.getAttribute('r')).toBe('0.22');
  });
});
