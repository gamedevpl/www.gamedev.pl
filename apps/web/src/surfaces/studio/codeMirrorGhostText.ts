import { completionStatus } from '@codemirror/autocomplete';
import { EditorState, Prec, StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { ignoreCompletionMetric, type CompletionReporter } from './codeMirrorTypes.js';
import type { FetchGhostText } from './codeMirrorTypes.js';

// TA-01's own caps — a window, never the whole file.
const GHOST_TEXT_MAX_PREFIX_CHARS = 3000;
const GHOST_TEXT_MAX_SUFFIX_CHARS = 1200;
const GHOST_TEXT_DEBOUNCE_MS = 300;

// Never mid-selection, never over an open tooltip.
function ghostTextSuppressed(state: EditorState): boolean {
  if (!state.selection.main.empty) return true;
  // Not 'pending': that fires on every keystroke, long before a dropdown shows.
  if (completionStatus(state) === 'active') return true;
  // No public accessor for an open hover/lint tooltip — DOM it is.
  return document.querySelector('.cm-tooltip-hover, .cm-tooltip-lint') !== null;
}

type GhostTextValue = { text: string; forDoc: Text } | null;

const setGhostText = StateEffect.define<GhostTextValue>();

// Hand-rolled: a tried library reset this on any unrelated dispatch.
const ghostTextField = StateField.define<GhostTextValue>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged) return null;
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) return effect.value;
    }
    // A cursor move with no edit makes a pinned proposal stale.
    if (tr.selection) return null;
    // Clears ghost text once the popup takes over — its Tab wins.
    if (completionStatus(tr.state) === 'active') return null;
    return value;
  },
});

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostTextWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost-text';
    span.textContent = this.text;
    return span;
  }
}

// Tab alone was unreachable on iOS; this tappable widget is the fallback.
class GhostTextAcceptWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-ghost-text-accept';
    button.textContent = '⇥';
    button.setAttribute('aria-label', 'Accept suggestion');
    button.title = 'Accept suggestion';

    // Not a tab stop: Tab already accepts inside the editor.
    button.tabIndex = -1;
    return button;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function ghostTextDecorations(state: EditorState): DecorationSet {
  const value = state.field(ghostTextField, false);
  if (!value) return Decoration.none;
  const pos = state.selection.main.head;
  return Decoration.set([
    Decoration.widget({ widget: new GhostTextWidget(value.text), side: 1 }).range(pos),
    Decoration.widget({ widget: new GhostTextAcceptWidget(), side: 2 }).range(pos),
  ]);
}

function acceptGhostText(view: EditorView, report: CompletionReporter): boolean {
  const value = view.state.field(ghostTextField, false);
  if (!value || completionStatus(view.state) === 'active') return false;
  report({ kind: 'ghost_text', outcome: 'accepted', latencyMs: 0, completionChars: value.text.length });
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: value.text },
    selection: { anchor: pos + value.text.length },
    userEvent: 'input.complete',
  });
  return true;
}

function acceptGhostTextFromEvent(event: Event, view: EditorView, report: CompletionReporter): boolean {
  if (!(event.target instanceof HTMLElement) || !event.target.closest('.cm-ghost-text-accept')) return false;
  event.preventDefault();
  return acceptGhostText(view, report);
}

// TA-02: debounces on doc change; cancels its own timer and fetch.
function ghostTextFetchPlugin(fetchGhostTextRef: { current: FetchGhostText | undefined }, report: CompletionReporter) {
  return ViewPlugin.fromClass(
    class {
      timer: number | null = null;
      abortController: AbortController | null = null;

      update(update: ViewUpdate): void {
        if (!update.docChanged) return;
        this.cancel();
        const view = update.view;
        this.timer = window.setTimeout(() => {
          this.timer = null;
          void this.fetch(view);
        }, GHOST_TEXT_DEBOUNCE_MS);
      }

      async fetch(view: EditorView): Promise<void> {
        const state = view.state;
        if (!fetchGhostTextRef.current || ghostTextSuppressed(state)) return;
        const pos = state.selection.main.head;
        const prefixWindow = state.sliceDoc(Math.max(0, pos - GHOST_TEXT_MAX_PREFIX_CHARS), pos);
        const suffixWindow = state.sliceDoc(pos, Math.min(state.doc.length, pos + GHOST_TEXT_MAX_SUFFIX_CHARS));
        const controller = new AbortController();
        this.abortController = controller;
        const startedAt = performance.now();
        let text: string;
        try {
          text = await fetchGhostTextRef.current(prefixWindow, suffixWindow, controller.signal);
        } catch {
          if (!controller.signal.aborted) {
            report({
              kind: 'ghost_text',
              outcome: 'failed',
              latencyMs: performance.now() - startedAt,
            });
          }
          return;
        }
        if (controller.signal.aborted) return;
        if (!text) {
          report({
            kind: 'ghost_text',
            outcome: 'empty',
            latencyMs: performance.now() - startedAt,
          });
          return;
        }
        // Nothing may have moved on while the network call was in flight.
        if (!view.state.doc.eq(state.doc) || view.state.selection.main.head !== pos) return;
        report({
          kind: 'ghost_text',
          outcome: 'shown',
          latencyMs: performance.now() - startedAt,
          completionChars: text.length,
        });
        view.dispatch({ effects: setGhostText.of({ text, forDoc: view.state.doc }) });
      }

      cancel(): void {
        if (this.timer !== null) {
          window.clearTimeout(this.timer);
          this.timer = null;
        }
        this.abortController?.abort();
        this.abortController = null;
      }

      destroy(): void {
        this.cancel();
      }
    },
  );
}

export function makeGhostTextExtension(
  fetchGhostTextRef: { current: FetchGhostText | undefined },
  report: CompletionReporter = ignoreCompletionMetric,
): Extension[] {
  const fetchPlugin = ghostTextFetchPlugin(fetchGhostTextRef, report);
  return [
    ghostTextField,
    EditorView.decorations.compute([ghostTextField], ghostTextDecorations),
    fetchPlugin,
    EditorView.domEventHandlers({
      // click covers AT/automation activation; both firing once is harmless.
      mousedown: (event, view) => acceptGhostTextFromEvent(event, view, report),
      click: (event, view) => acceptGhostTextFromEvent(event, view, report),
    }),
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => acceptGhostText(view, report),
        },
        {
          key: 'Escape',
          run: (view) => {
            const value = view.state.field(ghostTextField, false);
            if (!value) return false;
            report({ kind: 'ghost_text', outcome: 'dismissed', latencyMs: 0, completionChars: value.text.length });
            view.plugin(fetchPlugin)?.cancel();
            view.dispatch({ effects: setGhostText.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}
