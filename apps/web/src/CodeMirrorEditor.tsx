import { autocompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { forceLinting, linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import {
  defaultGotoHandler,
  renderDisplayParts,
  tsAutocomplete,
  tsFacet,
  tsGoto,
  tsHover,
  tsLintSource,
  tsSync,
  type HoverInfo,
} from '@valtown/codemirror-ts';
import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import type { CodeLanguage } from './codeTokens.js';

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

// GA-08: worker diagnostics capped to warning, distinct from server errors.
const tsAdvisoryLintSource = async (view: EditorView): Promise<CmDiagnostic[]> => {
  const found = await tsLintSource(view);
  return found.map((d) => (d.severity === 'error' ? { ...d, severity: 'warning' as const } : d));
};

// GA-07: default tsHover() drops documentation — this renderer adds it back.
function renderHoverTooltip(info: HoverInfo) {
  const dom = document.createElement('div');
  if (info.quickInfo?.displayParts) dom.appendChild(renderDisplayParts(info.quickInfo.displayParts));
  if (info.quickInfo?.documentation?.length) {
    const doc = document.createElement('div');
    doc.className = 'cm-ts-hover-doc';
    doc.textContent = info.quickInfo.documentation.map((part) => part.text).join('');
    dom.appendChild(doc);
  }
  return { dom };
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

// GA-05: ts extensions, or none — worker can turn ready mid-file.
function languageServiceExtensions(
  languageService: CodeMirrorLanguageService | undefined,
  onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined },
): Extension[] {
  if (!languageService) return [];
  return [
    tsFacet.of({ worker: languageService.worker, path: languageService.path }),
    tsSync(),
    autocompletion({ override: [tsAutocomplete()] }),
    tsHover({ renderTooltip: renderHoverTooltip }),
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
  // GA-05: reconfigured live below — a ready worker never remounts.
  const languageServiceCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const langExt = languageExtension(language);
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        selection: initialSelection,
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
          languageServiceCompartmentRef.current.of(languageServiceExtensions(languageService, onGotoDefinitionRef)),
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
    // GA-09: a cross-file jump lands off-screen without this.
    if (initialSelection)
      view.dispatch({ effects: EditorView.scrollIntoView(initialSelection.anchor, { y: 'center' }) });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs carry live values
  }, []);

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

  return <div ref={containerRef} className="code-surface-codemirror" data-testid="codemirror-editor" />;
}
