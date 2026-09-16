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
  });
});
