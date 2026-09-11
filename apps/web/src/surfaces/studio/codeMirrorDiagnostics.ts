import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { tsLintSource } from '@valtown/codemirror-ts';
import type { CodeMirrorDiagnostic } from './codeMirrorTypes.js';

// GA-08: worker diagnostics capped to warning, distinct from server errors.
export const tsAdvisoryLintSource = async (view: EditorView): Promise<CmDiagnostic[]> => {
  const found = await tsLintSource(view);
  return found.map((d) => (d.severity === 'error' ? { ...d, severity: 'warning' as const } : d));
};

export function toCmDiagnostics(view: EditorView, diagnostics: CodeMirrorDiagnostic[]): CmDiagnostic[] {
  const doc = view.state.doc;
  const out: CmDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.line < 1 || diagnostic.line > doc.lines) continue;
    const line = doc.line(diagnostic.line);
    out.push({ from: line.from, to: line.to, severity: diagnostic.severity ?? 'error', message: diagnostic.message });
  }
  return out;
}
