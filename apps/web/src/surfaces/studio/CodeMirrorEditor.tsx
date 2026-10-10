import { autocompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';
import { syntaxHighlighting } from '@codemirror/language';
import { forceLinting, linter, lintGutter } from '@codemirror/lint';
import { Compartment, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { tsFacet, tsGoto, tsSync } from '@valtown/codemirror-ts';
import type { CodeLanguage } from './codeTokens.js';
import { vsCodeSearchPanel } from './codeMirrorSearchPanel.js';
import {
  completionVisibilityExtension,
  measuredTsAutocomplete,
  type CompletionTracker,
} from './codeMirrorCompletion.js';
import { tsAdvisoryLintSource, toCmDiagnostics } from './codeMirrorDiagnostics.js';
import { makeGhostTextExtension } from './codeMirrorGhostText.js';
import { makeGotoHandler, modifierAwareHover, modifierHoverExtension, modifierHoverState } from './codeMirrorHover.js';
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
  onSave?: () => void;
  diagnostics: CodeMirrorDiagnostic[];
  readOnly?: boolean;
  languageService?: CodeMirrorLanguageService;
  onGotoDefinition?: GotoDefinitionHandler;
  initialSelection?: { anchor: number; head: number };
  fetchGhostText?: FetchGhostText;
  colorPickerLabel?: string;
  initialEditorState?: CodeSurfaceEditorState;
  onEditorStateChange?: (state: CodeSurfaceEditorState) => void;
};

function languageServiceExtensions(
  languageService: CodeMirrorLanguageService | undefined,
  onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined },
  report?: CompletionReporter,
): Extension[] {
  if (!languageService) return [];
  const hover = modifierAwareHover();
  const completionTracker: CompletionTracker = { pending: [], report };
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const { anchor, head } = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(anchor, value.length), head: Math.min(head, value.length) },
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

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
