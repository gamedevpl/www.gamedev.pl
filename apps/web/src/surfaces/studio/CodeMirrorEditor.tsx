import { indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';
import { syntaxHighlighting } from '@codemirror/language';
import { forceLinting, linter, lintGutter } from '@codemirror/lint';
import { Compartment, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import type { CodeLanguage } from './codeTokens.js';
import { vsCodeSearchPanel } from './codeMirrorSearchPanel.js';
import { toCmDiagnostics } from './codeMirrorDiagnostics.js';
import { languageServiceExtensions } from './codeMirrorLanguageService.js';
import { makeGhostTextExtension } from './codeMirrorGhostText.js';
import { colorPickerExtension } from './codeMirrorColorPicker.js';
import { languageExtension } from './codeMirrorLanguage.js';
import { darkChrome, darkHighlight } from './codeMirrorTheme.js';
import type {
  CompletionReporter,
  CodeMirrorDiagnostic,
  CodeMirrorLanguageService,
  FetchGhostText,
  GotoDefinitionHandler,
} from './codeMirrorTypes.js';
import {
  restoreCodeSurfaceEditorState,
  serializeCodeSurfaceEditorState,
  type CodeSurfaceEditorState,
} from './codeSurfaceEditorState.js';

export type { CodeMirrorDiagnostic, CodeMirrorLanguageService } from './codeMirrorTypes.js';

export type CodeMirrorEditorProps = {
  reportCompletion?: CompletionReporter;
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  // Bound to Mod-S — else the browser's save dialog opens.
  onSave?: () => void;
  diagnostics: CodeMirrorDiagnostic[];
  readOnly?: boolean;
  // GA-05: TypeScript extensions reconfigure when the worker becomes ready.
  languageService?: CodeMirrorLanguageService;
  onGotoDefinition?: GotoDefinitionHandler;
  // GA-09: mount-only selection for a cross-file jump landing.
  initialSelection?: { anchor: number; head: number };
  // TA-02: the host supplies the optional ghost-text transport.
  fetchGhostText?: FetchGhostText;
  colorPickerLabel?: string;
  // Saved per-file state lets undo survive switching to Play.
  initialEditorState?: CodeSurfaceEditorState;
  onEditorStateChange?: (state: CodeSurfaceEditorState) => void;
};

export default function CodeMirrorEditor({
  reportCompletion,
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
  // Mount-once extensions read refs without resetting the document or history.
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
  const languageServiceCompartmentRef = useRef(new Compartment());
  const colorPickerCompartmentRef = useRef(new Compartment());
  const ghostTextCompartmentRef = useRef(new Compartment());
  const ghostTextEnabled = Boolean(fetchGhostText) && !readOnly;

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
          // After basicSetup, so our panel replaces the stock search bar.
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
          languageServiceCompartmentRef.current.of(
            languageServiceExtensions(languageService, onGotoDefinitionRef, reportCompletion),
          ),
          ghostTextCompartmentRef.current.of(
            ghostTextEnabled ? makeGhostTextExtension(fetchGhostTextRef, reportCompletion) : [],
          ),
          ...(readOnly ? [] : [colorPickerCompartmentRef.current.of(colorPickerExtension(colorPickerLabel))]),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            // A document pushed by the parent is not a creator edit.
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
    const capture = () => onEditorStateChangeRef.current?.(serializeCodeSurfaceEditorState(view.state));
    window.addEventListener('beforeunload', capture, true);
    window.addEventListener('pagehide', capture, true);
    return () => {
      capture();
      window.removeEventListener('beforeunload', capture, true);
      window.removeEventListener('pagehide', capture, true);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs carry live values
  }, []);

  // External values preserve caret offsets without reviving stale undo entries.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const { anchor, head } = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(anchor, value.length), head: Math.min(head, value.length) },
      // Out of undo too — else Ctrl+Z restores pre-refresh text.
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  // GA-09: clamp same-file search and cross-file jump offsets.
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
        languageServiceExtensions(languageService, onGotoDefinitionRef, reportCompletion),
      ),
    });
    forceLinting(view);
  }, [languageService, reportCompletion]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || readOnly) return;
    view.dispatch({
      effects: colorPickerCompartmentRef.current.reconfigure(colorPickerExtension(colorPickerLabel)),
    });
  }, [colorPickerLabel, readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: ghostTextCompartmentRef.current.reconfigure(
        ghostTextEnabled ? makeGhostTextExtension(fetchGhostTextRef, reportCompletion) : [],
      ),
    });
  }, [ghostTextEnabled, reportCompletion]);
  return <div ref={containerRef} className="code-surface-codemirror" data-testid="codemirror-editor" />;
}
