import { indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { forceLinting, linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
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

export type CodeMirrorEditorProps = {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  diagnostics: CodeMirrorDiagnostic[];
  readOnly?: boolean;
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

export default function CodeMirrorEditor({ value, language, onChange, diagnostics, readOnly }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Refs so the extensions below (installed once at mount) always see the latest
  // callback/data without forcing a full editor remount on every prop change — the
  // one thing that must not remount on every keystroke or diagnostics update.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([indentWithTab]),
          ...(langExt ? [langExt] : []),
          lintGutter(),
          linter((v) => toCmDiagnostics(v, diagnosticsRef.current)),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.theme(
            {
              '&': { height: '100%', fontSize: '0.84rem' },
              '.cm-scroller': { fontFamily: 'var(--mono-font, monospace)', overflow: 'auto' },
              '.cm-content': { caretColor: '#00e4ac' },
            },
            { dark: true },
          ),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per keyed instance; value/onChange/diagnostics flow through refs above
  }, []);

  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagnostics]);

  return <div ref={containerRef} className="code-surface-codemirror" data-testid="codemirror-editor" />;
}
