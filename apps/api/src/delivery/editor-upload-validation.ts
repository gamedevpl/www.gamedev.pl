import { parseEditorDefinition, validateEditorContent } from '../platform/editor-contract.js';
import type { SourceFile } from './games-store.js';

export function editorUploadProblem(files: SourceFile[]): string | null {
  const editor = files.find((file) => file.path.trim() === 'EDITOR.json');
  if (!editor) return null;
  const parsed = parseEditorDefinition(editor.content);
  if (!parsed.definition || parsed.errors.length) return `EDITOR.json: ${parsed.errors.join('; ')}`;
  if (parsed.definition.validate === true)
    return 'Executable editor validators are not supported in untrusted deliveries';
  if (parsed.definition.version === 2) {
    const contentFile = files.find((file) => file.path.trim() === 'EDITOR.content.json');
    if (!contentFile) return 'EDITOR.content.json is required for v2';
    let content: unknown;
    try {
      content = JSON.parse(contentFile.content);
    } catch {
      return 'EDITOR.content.json is not valid JSON';
    }
    const errors = validateEditorContent(parsed.definition, content);
    if (errors.length) return `EDITOR.content.json: ${errors.join('; ')}`;
  }
  return null;
}
