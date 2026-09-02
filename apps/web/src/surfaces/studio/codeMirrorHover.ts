import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, activateHover, closeHoverTooltips, hoverTooltip, ViewPlugin } from '@codemirror/view';
import { defaultGotoHandler, renderDisplayParts, tsFacet, type HoverInfo } from '@valtown/codemirror-ts';
import type { GotoDefinitionHandler } from './codeMirrorTypes.js';

// GA-07: compact by default, expanded while the modifier is held.
function renderHoverTooltip(info: HoverInfo, expanded: boolean) {
  const dom = document.createElement('div');
  dom.className = expanded ? 'cm-ts-hover cm-ts-hover-expanded' : 'cm-ts-hover cm-ts-hover-compact';
  if (info.quickInfo?.displayParts) dom.appendChild(renderDisplayParts(info.quickInfo.displayParts));
  if (expanded && info.quickInfo?.documentation?.length) {
    const doc = document.createElement('div');
    doc.className = 'cm-ts-hover-doc';
    doc.textContent = info.quickInfo.documentation.map((part) => part.text).join('');
    dom.appendChild(doc);
  }
  return { dom };
}

type ModifierHoverState = {
  held: boolean;
  range: { from: number; to: number } | null;
} | null;

const setModifierHover = StateEffect.define<ModifierHoverState>();

export const modifierHoverState = StateField.define<ModifierHoverState>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged) return null;
    for (const effect of transaction.effects) {
      if (effect.is(setModifierHover)) return effect.value;
    }
    return value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value?.held && value.range
        ? Decoration.set([Decoration.mark({ class: 'cm-ts-navigable-link' }).range(value.range.from, value.range.to)])
        : Decoration.none,
    ),
});

function definitionRange(info: HoverInfo): { from: number; to: number } | null {
  const definition = [...(info.typeDef ?? []), ...(info.def ?? [])].at(0);
  if (!definition || !info.quickInfo) return null;
  return { from: info.start, to: info.start + info.quickInfo.textSpan.length };
}

function modifierHeld(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function modifierHoverExtension(hover: ReturnType<typeof hoverTooltip>): Extension {
  return ViewPlugin.fromClass(
    class {
      private pointer: { x: number; y: number } | null = null;
      private held = false;
      private requestId = 0;
      private lastPosition: number | null = null;

      private readonly onKeyDown = (event: KeyboardEvent) => {
        if (!modifierHeld(event)) return;
        this.setHeld(true);
      };

      private readonly onKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Meta' || event.key === 'Control' || !modifierHeld(event)) this.setHeld(false);
      };

      private readonly onBlur = () => this.setHeld(false);

      private readonly onMouseMove = (event: MouseEvent) => {
        this.pointer = { x: event.clientX, y: event.clientY };
        if (!this.held) return;
        const position = this.view.posAtCoords(this.pointer);
        if (position === null || position === this.lastPosition) return;
        this.lastPosition = position;
        void this.refresh(true);
      };

      private readonly onMouseLeave = () => {
        this.pointer = null;
        this.requestId += 1;
        this.lastPosition = null;
        this.view.dispatch({ effects: [setModifierHover.of(null), closeHoverTooltips] });
      };

      constructor(private readonly view: EditorView) {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        view.dom.addEventListener('mousemove', this.onMouseMove);
        view.dom.addEventListener('mouseleave', this.onMouseLeave);
      }

      private setHeld(held: boolean): void {
        if (this.held === held) return;
        this.held = held;
        this.requestId += 1;
        this.lastPosition = null;
        this.view.dispatch({ effects: [setModifierHover.of(held ? { held, range: null } : null), closeHoverTooltips] });
        if (!held || !this.pointer) return;
        void this.refresh(true);
      }

      private async refresh(reopenTooltip = false): Promise<void> {
        const pointer = this.pointer;
        if (!this.held || !pointer) return;
        const config = this.view.state.facet(tsFacet);
        const pos = this.view.posAtCoords(pointer);
        if (!config?.worker || pos === null) return;
        this.lastPosition = pos;
        const requestId = ++this.requestId;
        try {
          const info = await config.worker.getHover({ path: config.path, pos });
          if (requestId !== this.requestId || !this.held || !info) return;
          const range = definitionRange(info);
          this.view.dispatch({ effects: setModifierHover.of({ held: true, range }) });
          if (reopenTooltip) {
            activateHover(this.view, pos, 1, {
              tooltip: hover,
              until: (transaction) => transaction.effects.some((effect) => effect.is(setModifierHover)),
            });
          }
        } catch {
          if (requestId === this.requestId) this.view.dispatch({ effects: setModifierHover.of(null) });
        }
      }

      destroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        this.view.dom.removeEventListener('mousemove', this.onMouseMove);
        this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
      }
    },
  );
}

export function modifierAwareHover(): ReturnType<typeof hoverTooltip> {
  return hoverTooltip(async (view, pos) => {
    const config = view.state.facet(tsFacet);
    if (!config?.worker) return null;
    const info = await config.worker.getHover({ path: config.path, pos });
    if (!info || !info.quickInfo) return null;
    const expanded = view.state.field(modifierHoverState, false)?.held === true;
    return {
      pos: info.start,
      end: info.end,
      create: () => renderHoverTooltip(info, expanded),
    };
  });
}

// GA-09: same-file jumps select in place; else bubbles up.
export function makeGotoHandler(onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined }) {
  return (currentPath: string, hoverData: HoverInfo, view: EditorView) => {
    if (defaultGotoHandler(currentPath, hoverData, view)) return true;
    const definition = [...(hoverData.typeDef ?? []), ...(hoverData.def ?? [])].at(0);
    if (!definition) return undefined;
    onGotoDefinitionRef.current?.(
      definition.fileName,
      definition.textSpan.start,
      definition.textSpan.start + definition.textSpan.length,
    );
    return true;
  };
}
