import {
  autocompletion,
  completionStatus,
  currentCompletions,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search } from '@codemirror/search';
import { forceLinting, linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import {
  Compartment,
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  activateHover,
  closeHoverTooltips,
  hoverTooltip,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import {
  defaultGotoHandler,
  renderDisplayParts,
  tsAutocomplete,
  tsFacet,
  tsGoto,
  tsLintSource,
  tsSync,
  type HoverInfo,
} from '@valtown/codemirror-ts';
import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import type { CodeLanguage } from './codeTokens.js';
import { vsCodeSearchPanel } from './codeMirrorSearchPanel.js';
import { colorForPicker, colorFromPicker, findHexColors } from './codeMirrorColors.js';
import {
  restoreCodeSurfaceEditorState,
  serializeCodeSurfaceEditorState,
  type CodeSurfaceEditorState,
} from './codeSurfaceEditorState.js';
import { recordCodeCompletion } from '../../visitTelemetry.js';

// CodeMirror 6 (CE-14): lazy chunk; keyed by file path to remount.

export type CodeMirrorDiagnostic = { line: number; message: string; severity?: 'error' | 'warning' };

// GA-05: the worker bound to this editor's open file.
export type CodeMirrorLanguageService = { worker: Omit<WorkerShape, 'initialize'>; path: string };

export type CodeMirrorEditorProps = {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  // Bound to Mod-S — else the browser's save dialog opens.
  onSave?: () => void;
  diagnostics: CodeMirrorDiagnostic[];
  readOnly?: boolean;
  // Once set, wires tsSync/tsAutocomplete/tsHover/tsLinter; else plain CodeMirror.
  languageService?: CodeMirrorLanguageService;
  // GA-09: cmd/ctrl-click target — path is vfs-rooted.
  onGotoDefinition?: (path: string, from: number, to: number) => void;
  // GA-09: mount-only selection for a cross-file jump landing.
  initialSelection?: { anchor: number; head: number };
  // TA-02: ghost-text proposal for the window around the cursor.
  fetchGhostText?: (prefixWindow: string, suffixWindow: string, signal: AbortSignal) => Promise<string>;
  colorPickerLabel?: string;
  // Saved per-file state lets the undo stack survive switching to Play.
  initialEditorState?: CodeSurfaceEditorState;
  onEditorStateChange?: (state: CodeSurfaceEditorState) => void;
};

function languageExtension(language: CodeLanguage): Extension | null {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true });
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    case 'markdown':
      return markdown();
    default:
      return null;
  }
}

class ColorSwatchWidget extends WidgetType {
  constructor(
    readonly color: string,
    readonly from: number,
    readonly to: number,
    readonly label: string,
    readonly onChange: (from: number, to: number, color: string) => void,
  ) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color && other.from === this.from && other.to === this.to && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorForPicker(this.color);
    input.className = 'cm-color-picker';
    input.title = `${this.label} ${this.color}`;
    input.setAttribute('aria-label', `${this.label} ${this.color}`);
    input.addEventListener('change', () => this.onChange(this.from, this.to, colorFromPicker(this.color, input.value)));
    return input;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function colorPickerExtension(label: string): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(readonly view: EditorView) {
        this.decorations = this.buildDecorations();
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) this.decorations = this.buildDecorations();
      }

      private buildDecorations(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const match of findHexColors(this.view.state.doc.toString())) {
          builder.add(
            match.to,
            match.to,
            Decoration.widget({
              widget: new ColorSwatchWidget(match.color, match.from, match.to, label, this.replaceColor),
              side: 1,
            }),
          );
        }
        return builder.finish();
      }

      private replaceColor = (from: number, to: number, color: string): void => {
        const current = this.view.state.doc.sliceString(from, to);
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(current)) return;
        this.view.dispatch({ changes: { from, to, insert: color }, userEvent: 'input' });
        this.view.focus();
      };
    },
  );
  return [plugin, EditorView.decorations.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none)];
}

// Palette matches the read-only viewer's .code-tok-* colors.
const darkHighlight = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--muted, #8b949e)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#7ee787' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#79c0ff' },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.self], color: '#ff7b72' },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName], color: '#d2a8ff' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#d2a8ff' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#ffa657' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--text, #e6edf3)' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: 'var(--text, #e6edf3)' },
  { tag: tags.heading, color: '#79c0ff', fontWeight: 'bold' },
  { tag: tags.link, color: '#7ee787', textDecoration: 'underline' },
  { tag: tags.invalid, color: '#ff7b72', textDecoration: 'underline wavy' },
]);

const darkChrome = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '0.84rem', backgroundColor: 'transparent', color: 'var(--text, #e6edf3)' },
    '.cm-scroller': { fontFamily: 'var(--mono-font, monospace)', overflow: 'auto' },
    '.cm-content': { caretColor: '#00e4ac' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#00e4ac' },
    '.cm-activeLine': { backgroundColor: 'rgba(148, 163, 184, 0.07)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(148, 163, 184, 0.07)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(0, 228, 172, 0.16)',
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(0, 228, 172, 0.12)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(56, 189, 248, 0.22)', borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(0, 228, 172, 0.38)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(0, 228, 172, 0.2)', outline: 'none' },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgba(255, 123, 114, 0.2)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted, #8b949e)', border: 'none' },
    '.cm-foldGutter, .cm-lineNumbers': { color: 'var(--muted, #8b949e)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--panel, #161c22)',
      color: 'var(--text, #e6edf3)',
      border: '1px solid rgba(148, 163, 184, 0.25)',
      borderRadius: '8px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(0, 228, 172, 0.16)',
      color: 'var(--text, #e6edf3)',
    },
    // The search widget floats over the editor, so panels reserve no space.
    '.cm-panels': { backgroundColor: 'transparent', color: 'var(--text, #e6edf3)' },
    '.cm-panels.cm-panels-top': {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 'auto',
      zIndex: 12,
      borderBottom: 'none',
    },
    '.cm-vs-search': {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '2px',
      margin: '6px 16px 0 6px',
      padding: '6px 6px 6px 2px',
      borderRadius: '10px',
      border: '1px solid var(--panel-border, rgba(148, 163, 184, 0.25))',
      backgroundColor: 'var(--panel, #161c22)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
      fontSize: '0.76rem',
      maxWidth: 'calc(100% - 22px)',
    },
    '.cm-vs-body': { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
    // Wraps rather than overflowing the editor on a narrow viewport.
    '.cm-vs-row': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px', minWidth: 0 },
    // Without this, display:flex beats the hidden attribute and replace never collapses.
    '.cm-vs-row[hidden]': { display: 'none' },
    // The chevron spans both rows, as in VS Code.
    '.cm-vs-expand': { alignSelf: 'stretch', height: 'auto', flex: 'none' },
    '.cm-vs-expanded .cm-vs-expand svg': { transform: 'rotate(90deg)' },
    '.cm-vs-expand svg': { transition: 'transform 120ms ease' },
    '.cm-vs-field-wrap': {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      // Fixed, not growing, so both fields match width.
      flex: '0 1 15rem',
      width: '15rem',
      minWidth: '6rem',
      padding: '0 3px 0 7px',
      borderRadius: '6px',
      border: '1px solid var(--panel-border, rgba(148, 163, 184, 0.25))',
      backgroundColor: 'rgba(9, 13, 17, 0.7)',
    },
    '.cm-vs-field-wrap:focus-within': {
      borderColor: 'var(--turquoise, #00e4ac)',
      boxShadow: '0 0 0 1px rgba(0, 228, 172, 0.35)',
    },
    '.cm-vs-invalid .cm-vs-field-wrap:first-of-type': { borderColor: 'var(--error, #ff6b6b)' },
    '.cm-vs-field': {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: 'var(--text, #e6edf3)',
      fontFamily: 'var(--mono-font, monospace)',
      fontSize: '0.76rem',
      padding: '5px 0',
    },
    '.cm-vs-field::placeholder': { color: 'var(--muted, #8b949e)' },
    '.cm-vs-toggles': { display: 'flex', alignItems: 'center', gap: '1px', flex: 'none' },
    '.cm-vs-toggle': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      padding: 0,
      border: 'none',
      borderRadius: '4px',
      background: 'transparent',
      color: 'var(--muted, #8b949e)',
      font: 'inherit',
      fontSize: '0.68rem',
      lineHeight: 1,
      cursor: 'pointer',
    },
    '.cm-vs-toggle:hover': { backgroundColor: 'rgba(148, 163, 184, 0.16)', color: 'var(--text, #e6edf3)' },
    '.cm-vs-toggle[aria-pressed=true]': {
      backgroundColor: 'rgba(0, 228, 172, 0.18)',
      color: 'var(--turquoise, #00e4ac)',
    },
    '.cm-vs-count': {
      flex: 'none',
      minWidth: '4.6rem',
      padding: '0 4px',
      color: 'var(--muted, #8b949e)',
      fontSize: '0.7rem',
      whiteSpace: 'nowrap',
      textAlign: 'right',
    },
    '.cm-vs-icon-button': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      width: '24px',
      height: '24px',
      padding: 0,
      border: 'none',
      borderRadius: '5px',
      background: 'transparent',
      color: 'var(--muted, #8b949e)',
      font: 'inherit',
      cursor: 'pointer',
    },
    '.cm-vs-text-button': { width: 'auto', padding: '0 7px', fontSize: '0.72rem', fontWeight: 500 },
    '.cm-vs-icon-button:hover': { backgroundColor: 'rgba(148, 163, 184, 0.16)', color: 'var(--text, #e6edf3)' },
    '.cm-vs-icon-button:active': { backgroundColor: 'rgba(0, 228, 172, 0.2)' },
    '.cm-vs-search button:focus-visible': {
      outline: '1px solid var(--turquoise, #00e4ac)',
      outlineOffset: '-1px',
    },
  },
  { dark: true },
);

// GA-08: worker diagnostics capped to warning, distinct from server errors.
const tsAdvisoryLintSource = async (view: EditorView): Promise<CmDiagnostic[]> => {
  const found = await tsLintSource(view);
  return found.map((d) => (d.severity === 'error' ? { ...d, severity: 'warning' as const } : d));
};

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

const modifierHoverState = StateField.define<ModifierHoverState>({
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

function modifierHoverExtension(hover: ReturnType<typeof hoverTooltip>): Extension {
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

function modifierAwareHover(): ReturnType<typeof hoverTooltip> {
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

function toCmDiagnostics(view: EditorView, diagnostics: CodeMirrorDiagnostic[]): CmDiagnostic[] {
  const doc = view.state.doc;
  const out: CmDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.line < 1 || diagnostic.line > doc.lines) continue;
    const line = doc.line(diagnostic.line);
    out.push({ from: line.from, to: line.to, severity: diagnostic.severity ?? 'error', message: diagnostic.message });
  }
  return out;
}

type GotoDefinitionHandler = (path: string, from: number, to: number) => void;

// GA-09: same-file jumps select in place; else bubbles up.
function makeGotoHandler(onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined }) {
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

// TA-01's own caps — a window, never the whole file.
const GHOST_TEXT_MAX_PREFIX_CHARS = 3000;
const GHOST_TEXT_MAX_SUFFIX_CHARS = 1200;
const GHOST_TEXT_DEBOUNCE_MS = 300;

type FetchGhostText = (prefixWindow: string, suffixWindow: string, signal: AbortSignal) => Promise<string>;

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
    const span = document.createElement('span');
    span.className = 'cm-ghost-text-accept';
    span.textContent = '⇥';
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', 'Accept suggestion');
    span.title = 'Accept suggestion';
    return span;
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

function acceptGhostText(view: EditorView): boolean {
  const value = view.state.field(ghostTextField, false);
  if (!value || completionStatus(view.state) === 'active') return false;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: value.text },
    selection: { anchor: pos + value.text.length },
    userEvent: 'input.complete',
  });
  return true;
}

function acceptGhostTextFromEvent(event: Event, view: EditorView): boolean {
  if (!(event.target instanceof HTMLElement) || !event.target.closest('.cm-ghost-text-accept')) return false;
  event.preventDefault();
  return acceptGhostText(view);
}

// TA-02: debounces on doc change; cancels its own timer and fetch.
function ghostTextFetchPlugin(fetchGhostTextRef: { current: FetchGhostText | undefined }) {
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
            recordCodeCompletion({
              kind: 'ghost_text',
              outcome: 'failed',
              latencyMs: performance.now() - startedAt,
            });
          }
          return;
        }
        if (controller.signal.aborted) return;
        if (!text) {
          recordCodeCompletion({
            kind: 'ghost_text',
            outcome: 'empty',
            latencyMs: performance.now() - startedAt,
          });
          return;
        }
        // Nothing may have moved on while the network call was in flight.
        if (!view.state.doc.eq(state.doc) || view.state.selection.main.head !== pos) return;
        recordCodeCompletion({
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

function makeGhostTextExtension(fetchGhostTextRef: { current: FetchGhostText | undefined }): Extension[] {
  const fetchPlugin = ghostTextFetchPlugin(fetchGhostTextRef);
  return [
    ghostTextField,
    EditorView.decorations.compute([ghostTextField], ghostTextDecorations),
    fetchPlugin,
    EditorView.domEventHandlers({
      // click covers AT/automation activation; both firing once is harmless.
      mousedown: acceptGhostTextFromEvent,
      click: acceptGhostTextFromEvent,
    }),
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => acceptGhostText(view),
        },
        {
          key: 'Escape',
          run: (view) => {
            const value = view.state.field(ghostTextField, false);
            if (!value) return false;
            view.plugin(fetchPlugin)?.cancel();
            view.dispatch({ effects: setGhostText.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}

type CompletionAttempt = {
  context: CompletionContext;
  startedAt: number;
  candidateCount: number;
  options: CompletionResult['options'];
  settled: boolean;
};

type CompletionTracker = { pending: CompletionAttempt[] };

function settleCompletionAttempt(tracker: CompletionTracker, attempt: CompletionAttempt, shown: boolean): void {
  if (attempt.settled) return;
  attempt.settled = true;
  tracker.pending = tracker.pending.filter((pending) => pending !== attempt);
  recordCodeCompletion({
    kind: 'language_service',
    outcome: shown ? 'shown' : 'empty',
    latencyMs: performance.now() - attempt.startedAt,
    candidateCount: attempt.candidateCount,
  });
}

function completionVisibilityExtension(tracker: CompletionTracker): Extension {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate): void {
        if (tracker.pending.length === 0) return;
        if (tracker.pending.some((attempt) => attempt.context.aborted)) {
          for (const attempt of [...tracker.pending]) {
            if (attempt.context.aborted) settleCompletionAttempt(tracker, attempt, false);
          }
        }

        if (tracker.pending.length === 0) return;
        const status = completionStatus(update.state);
        if (status === 'pending') return;
        const visibleOptions = currentCompletions(update.state);
        for (const attempt of [...tracker.pending]) {
          const shown = status === 'active' && visibleOptions.some((option) => attempt.options.includes(option));
          const settledAsEmpty = status !== 'active' || visibleOptions.length === 0;
          if (shown || settledAsEmpty) settleCompletionAttempt(tracker, attempt, shown);
        }
      }

      destroy(): void {
        for (const attempt of [...tracker.pending]) settleCompletionAttempt(tracker, attempt, false);
      }
    },
  );
}

function measuredTsAutocomplete(tracker: CompletionTracker): CompletionSource {
  const source = tsAutocomplete();
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const startedAt = performance.now();
    try {
      const result = await source(context);
      if (context.aborted) {
        recordCodeCompletion({
          kind: 'language_service',
          outcome: 'empty',
          latencyMs: performance.now() - startedAt,
          candidateCount: result?.options.length ?? 0,
        });
        return null;
      }
      if (!result?.options.length) {
        recordCodeCompletion({
          kind: 'language_service',
          outcome: 'empty',
          latencyMs: performance.now() - startedAt,
          candidateCount: 0,
        });
        return result;
      }
      const attempt: CompletionAttempt = {
        context,
        startedAt,
        candidateCount: result.options.length,
        options: result.options,
        settled: false,
      };
      tracker.pending.push(attempt);
      context.addEventListener('abort', () => settleCompletionAttempt(tracker, attempt, false), { onDocChange: true });
      return result ? { ...result, validFor: result.validFor ?? /^[\w$]*$/ } : null;
    } catch (error) {
      recordCodeCompletion({
        kind: 'language_service',
        outcome: 'failed',
        latencyMs: performance.now() - startedAt,
      });
      throw error;
    }
  };
}

// GA-05: ts extensions, or none — worker can turn ready mid-file.
function languageServiceExtensions(
  languageService: CodeMirrorLanguageService | undefined,
  onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined },
): Extension[] {
  if (!languageService) return [];
  const hover = modifierAwareHover();
  const completionTracker: CompletionTracker = { pending: [] };
  return [
    tsFacet.of({ worker: languageService.worker, path: languageService.path }),
    tsSync(),
    modifierHoverState,
    autocompletion({ override: [measuredTsAutocomplete(completionTracker)] }),
    completionVisibilityExtension(completionTracker),
    hover,
    modifierHoverExtension(hover),
    tsGoto({ gotoHandler: makeGotoHandler(onGotoDefinitionRef) }),
    linter(tsAdvisoryLintSource),
  ];
}

export default function CodeMirrorEditor({
  value,
  language,
  onChange,
  onSave,
  diagnostics,
  readOnly,
  languageService,
  onGotoDefinition,
  initialSelection,
  fetchGhostText,
  colorPickerLabel = 'Choose color',
  initialEditorState,
  onEditorStateChange,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Refs so mount-once extensions see the latest values, no remount.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const onGotoDefinitionRef = useRef(onGotoDefinition);
  onGotoDefinitionRef.current = onGotoDefinition;
  const fetchGhostTextRef = useRef(fetchGhostText);
  fetchGhostTextRef.current = fetchGhostText;
  const onEditorStateChangeRef = useRef(onEditorStateChange);
  onEditorStateChangeRef.current = onEditorStateChange;
  // GA-05: reconfigured live below — a ready worker never remounts.
  const languageServiceCompartmentRef = useRef(new Compartment());
  const colorPickerCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const langExt = languageExtension(language);
    const view = new EditorView({
      parent: containerRef.current,
      state: restoreCodeSurfaceEditorState(
        initialEditorState,
        value,
        [
          basicSetup,
          // After basicSetup, so this createPanel wins over the stock search bar.
          search({ top: true, createPanel: vsCodeSearchPanel }),
          keymap.of([
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
          ]),
          ...(langExt ? [langExt] : []),
          lintGutter(),
          linter((v) => toCmDiagnostics(v, diagnosticsRef.current)),
          languageServiceCompartmentRef.current.of(languageServiceExtensions(languageService, onGotoDefinitionRef)),
          ...(readOnly ? [] : makeGhostTextExtension(fetchGhostTextRef)),
          ...(readOnly ? [] : [colorPickerCompartmentRef.current.of(colorPickerExtension(colorPickerLabel))]),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            // A doc the parent pushed in is not the creator's edit.
            if (update.transactions.some((transaction) => transaction.annotation(Transaction.remote))) return;
            onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.lineWrapping,
          syntaxHighlighting(darkHighlight),
          darkChrome,
        ],
        initialSelection,
      ),
    });
    viewRef.current = view;
    return () => {
      onEditorStateChangeRef.current?.(serializeCodeSurfaceEditorState(view.state));
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs carry live values
  }, []);

  // Takes an externally changed `value` into the doc.

  // The mount effect reads `value` once; rewrites needed a reload.

  // A typing creator gets their own draft back, already matching.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    // The caret keeps its offset where the text allows.
    const { anchor, head } = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(anchor, value.length), head: Math.min(head, value.length) },
      // Out of undo too — else Ctrl+Z restores pre-refresh text.
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  // GA-09 jumps, including same-file search hits; offsets clamped to doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !initialSelection) return;
    const docLength = view.state.doc.length;
    const anchor = Math.min(initialSelection.anchor, docLength);
    const head = Math.min(initialSelection.head, docLength);
    view.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    });
    view.focus();
  }, [initialSelection]);

  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageServiceCompartmentRef.current.reconfigure(
        languageServiceExtensions(languageService, onGotoDefinitionRef),
      ),
    });
  }, [languageService]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || readOnly) return;
    view.dispatch({
      effects: colorPickerCompartmentRef.current.reconfigure(colorPickerExtension(colorPickerLabel)),
    });
  }, [colorPickerLabel, readOnly]);

  return <div ref={containerRef} className="code-surface-codemirror" data-testid="codemirror-editor" />;
}
