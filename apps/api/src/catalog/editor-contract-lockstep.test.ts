import { describe, expect, it } from 'vitest';
import {
  editorContractFingerprint,
  extractNamedFunction,
  defaultReadLocalFile,
  readLocalEditorContract,
} from './editor-contract-lockstep.js';

describe('editor-contract lockstep fingerprint', () => {
  it('extracts a named function body even when the file is split', () => {
    const source = 'const x = 1;\nexport function validateEditorContent() { return 2; }\nconst y = 3;\n';
    expect(extractNamedFunction(source, 'validateEditorContent')).toBe(
      'export function validateEditorContent() { return 2; }',
    );
  });

  it('skips an object return type when locating the function body', () => {
    const source =
      'export function parseEditorDefinition(source: string): { definition: null; errors: string[] } { return "body"; }';
    expect(extractNamedFunction(source, 'parseEditorDefinition')).toContain('return "body"');
    expect(extractNamedFunction(source, 'parseEditorDefinition')).not.toBe(
      'export function parseEditorDefinition(source: string): { definition: null; errors: string[] }',
    );
  });

  it('joins parse, validate, and generate in a stable order', () => {
    const parse = 'export function parseEditorDefinition() { return "p"; }';
    const validate = 'export function validateEditorContent() { return "v"; }';
    const generate = 'export function generateEditorContentModule() { return "g"; }';
    const split = `${parse}\n${generate}\n${validate}`;
    const combined = `${parse}\n${validate}\n${generate}`;
    expect(editorContractFingerprint(split)).toBe(editorContractFingerprint(combined));
    expect(editorContractFingerprint(split)).toContain('return "v"');
  });

  it('reads the split local sources from disk', () => {
    const source = readLocalEditorContract(defaultReadLocalFile);
    expect(extractNamedFunction(source, 'parseEditorDefinition')).toBeTruthy();
    expect(extractNamedFunction(source, 'generateEditorContentModule')).toBeTruthy();
    expect(extractNamedFunction(source, 'validateEditorContent')).toContain('content must be an object');
    expect(editorContractFingerprint(source)).toContain('function valueProblem');
    expect(editorContractFingerprint(source)).toContain('MAX_TEXT_LENGTH = 240');
    expect(editorContractFingerprint(source)).toContain("EDITOR_CONTENT_FILE = 'EDITOR.content.json'");
  });

  it('changes when a helper or limit used by the wrappers changes', () => {
    const base = [
      'export const MAX_TEXT_LENGTH = 240;',
      "export const EDITOR_CONTENT_FILE = 'EDITOR.content.json';",
      'export function valueProblem() { return "old"; }',
      'export function parseEditorDefinition() { return "p"; }',
      'export function validateEditorContent() { return valueProblem(); }',
      'export function generateEditorContentModule() { return "g"; }',
    ].join('\n');
    const helperChanged = base.replace('return "old"', 'return "new"');
    const limitChanged = base.replace('MAX_TEXT_LENGTH = 240', 'MAX_TEXT_LENGTH = 99');
    const filenameChanged = base.replace('EDITOR.content.json', 'EDITOR.other.json');
    expect(editorContractFingerprint(base)).not.toBe(editorContractFingerprint(helperChanged));
    expect(editorContractFingerprint(base)).not.toBe(editorContractFingerprint(limitChanged));
    expect(editorContractFingerprint(base)).not.toBe(editorContractFingerprint(filenameChanged));
  });

  it('treats exported and local helper declarations as the same body', () => {
    const exported =
      'export function valueProblem() { return 1; }\nexport function validateEditorContent() { return 2; }';
    const local = 'function valueProblem() { return 1; }\nexport function validateEditorContent() { return 2; }';
    expect(editorContractFingerprint(exported)).toBe(editorContractFingerprint(local));
  });

  it('ignores comments inside a helper so the games-repo copy can keep them', () => {
    const plain =
      'export function unreachable() {\n  if (queue.length === 0) return [];\n  return missed;\n}\nexport function validateEditorContent() { return 1; }';
    const commented =
      'function unreachable() {\n  // No origin at all is a separate failure\n  if (queue.length === 0) return [];\n  return missed;\n}\nexport function validateEditorContent() { return 1; }';
    expect(editorContractFingerprint(plain)).toBe(editorContractFingerprint(commented));
  });
});
