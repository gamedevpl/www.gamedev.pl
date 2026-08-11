import { autocompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { forceLinting, linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { tsAutocomplete, tsFacet, tsHover, tsLintSource, tsSync } from '@valtown/codemirror-ts';
import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import type { CodeLanguage } from './codeTokens.js';

/**
 * CodeMirror 6 (creator-code-editing-execution-plan.md CE-14, owner decision). Lazy
 * chunk — this module is only reached by a dynamic `import()` from CodeSurface.tsx, so
 * catalog/player/thread visitors pay zero bytes for it. Loaded only when the Code
 * surface is both open and editable; the read path (CE-07) never imports this at all.
 *
 * Uncontrolled by design after mount: `value` seeds the initial document and the
 * caller keys this component by file path so switching files remounts it cleanly
 * (fresh undo history, fresh cursor) rather than fighting CodeMirror's own state with
 * an external doc replacement on every keystroke.
 */

export type CodeMirrorDiagnostic = { line: number; message: string; severity?: 'error' | 'warning' };

/** GA-05: a live worker handle from codeSurfaceLanguageService.ts, bound to the file
 * currently open in this editor instance. */
export type CodeMirrorLanguageService = { worker: Omit<WorkerShape, 'initialize'>; path: string };

export type CodeMirrorEditorProps = {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  /** Bound to Mod-S — without it, Ctrl/Cmd+S opens the browser's save-page dialog. */
  onSave?: () => void;
  diagnostics: CodeMirrorDiagnostic[];
  readOnly?: boolean;
  /** Present once GA-04's worker has initialized and this file is a `.ts`/`.tsx` —
   * wires tsSync/tsAutocomplete/tsHover/advisory tsLinter against it. Absent (worker
   * still loading, its chunk failed, or a non-TypeScript file) means plain CodeMirror,
   * same as before this existed (GA-06). */
  languageService?: CodeMirrorLanguageService;
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
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(0, 228, 172, 0.2)', outline: 'none' },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgba(255, 123, 114, 0.2)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted, #8b949e)', border: 'none' },
    '.cm-foldGutter, .cm-lineNumbers': { color: 'var(--muted, #8b949e)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--panel-bg, #0c1218)',
      color: 'var(--text, #e6edf3)',
      border: '1px solid rgba(148, 163, 184, 0.25)',
      borderRadius: '8px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(0, 228, 172, 0.16)',
      color: 'var(--text, #e6edf3)',
    },
    '.cm-panels': { backgroundColor: 'var(--panel-bg, #0c1218)', color: 'var(--text, #e6edf3)' },
  },
  { dark: true },
);

/**
 * GA-08: the worker's own diagnostics, advisory only — never the same visual weight
 * as `diagnostics` (the server typecheck gate, plumbed through `linter()` below at
 * `severity: 'error'`). Capped to `warning` so CodeMirror's built-in lint styling
 * tells them apart on sight, without a custom class: the server's red squiggle is the
 * one that can block a delivery, the worker's amber one is a live guess that follows
 * every keystroke and can be wrong or stale.
 */
const tsAdvisoryLintSource = async (view: EditorView): Promise<CmDiagnostic[]> => {
  const found = await tsLintSource(view);
  return found.map((d) => (d.severity === 'error' ? { ...d, severity: 'warning' as const } : d));
};

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

export default function CodeMirrorEditor({
  value,
  language,
  onChange,
  onSave,
  diagnostics,
  readOnly,
  languageService,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Refs so the extensions below (installed once at mount) always see the latest
  // callback/data without forcing a full editor remount on every prop change — the
  // one thing that must not remount on every keystroke or diagnostics update.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const langExt = languageExtension(language);
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
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
          // GA-05: only once the worker (GA-04) has a language service ready for this
          // file — see CodeMirrorLanguageService's own doc comment for what "ready" means.
          ...(languageService
            ? [
                tsFacet.of({ worker: languageService.worker, path: languageService.path }),
                tsSync(),
                autocompletion({ override: [tsAutocomplete()] }),
                tsHover(),
                linter(tsAdvisoryLintSource),
              ]
            : []),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.lineWrapping,
          syntaxHighlighting(darkHighlight),
          darkChrome,
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per keyed instance; value/onChange/diagnostics flow through refs above; languageService's caller keys this component on its readiness, so a change here always means a remount too
  }, []);

  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagnostics]);

  return <div ref={containerRef} className="code-surface-codemirror" data-testid="codemirror-editor" />;
}
