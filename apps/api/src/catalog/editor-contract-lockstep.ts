// Fingerprint parse/validate/generate across the split editor-contract files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLeadingDocComment } from '../platform/games-repo-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_EDITOR_CONTRACT_PATH = path.join(HERE, '../creation/editor-contract.ts');
const REPO_ROOT = path.join(HERE, '../../../..');
const LOCAL_VALIDATE_PATH = path.join(REPO_ROOT, 'packages/contract/src/editor-validate.ts');
const LOCAL_VALIDATE_REACH_PATH = path.join(REPO_ROOT, 'packages/contract/src/editor-validate-reach.ts');

const LOCKSTEP_FNS = ['parseEditorDefinition', 'validateEditorContent', 'generateEditorContentModule'];

export function extractNamedFunction(source: string, name: string): string | null {
  const match = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!match) return null;
  const brace = source.indexOf('{', match.index);
  if (brace < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : '';
    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return null;
}

export function editorContractFingerprint(source: string): string {
  const parts = LOCKSTEP_FNS.map((name) => extractNamedFunction(source, name)).filter(
    (part): part is string => part !== null,
  );
  if (parts.length === 0) return stripLeadingDocComment(source);
  return parts.join('\n\n');
}

export function readLocalEditorContract(readLocalFile: (filePath: string) => string): string {
  const api = readLocalFile(LOCAL_EDITOR_CONTRACT_PATH);
  const extras = [LOCAL_VALIDATE_PATH, LOCAL_VALIDATE_REACH_PATH].map((filePath) => {
    const text = readLocalFile(filePath);
    return text === api ? '' : text;
  });
  return [api, ...extras].filter((text) => text.length > 0).join('\n');
}

export function defaultReadLocalFile(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}
