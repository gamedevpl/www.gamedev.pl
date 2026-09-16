// Fingerprint editor-contract helpers, limits, and entry points.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLeadingDocComment } from '../platform/games-repo-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_EDITOR_CONTRACT_PATH = path.join(HERE, '../creation/editor-contract.ts');
const REPO_ROOT = path.join(HERE, '../../../..');
const LOCAL_VALIDATE_PATH = path.join(REPO_ROOT, 'packages/contract/src/editor-validate.ts');
const LOCAL_VALIDATE_REACH_PATH = path.join(REPO_ROOT, 'packages/contract/src/editor-validate-reach.ts');
const LOCAL_KIT_PATH = path.join(REPO_ROOT, 'packages/contract/src/editor-kit.ts');

const FN_NAME_RE = /(?:export\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const CONST_NAME_RE =
  /(?:export\s+)?const\s+(MAX_[A-Z0-9_]+|PARAMS_KEY|LAYERS_KEY|PROPERTY_TYPES|KEY_PATTERN|TILE_KEY_PATTERN|HEX_COLOR_PATTERN)\s*=/g;

function uniqueSorted(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

function listFunctionNames(source: string): string[] {
  const names: string[] = [];
  FN_NAME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FN_NAME_RE.exec(source)) !== null) names.push(match[1]);
  return uniqueSorted(names);
}

function listConstNames(source: string): string[] {
  const names: string[] = [];
  CONST_NAME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONST_NAME_RE.exec(source)) !== null) names.push(match[1]);
  return uniqueSorted(names);
}

function stripExport(text: string): string {
  return text.replace(/^export\s+/, '');
}

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

export function extractNamedConst(source: string, name: string): string | null {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*[^;]+;`).exec(source);
  return match ? match[0] : null;
}

const ENTRY_FNS = ['parseEditorDefinition', 'validateEditorContent', 'generateEditorContentModule'];

export function editorContractFingerprint(source: string): string {
  const hasEntry = ENTRY_FNS.some((name) => extractNamedFunction(source, name));
  if (!hasEntry) return stripLeadingDocComment(source);
  const consts = listConstNames(source)
    .map((name) => extractNamedConst(source, name))
    .filter((part): part is string => part !== null)
    .map(stripExport);
  const fns = listFunctionNames(source)
    .map((name) => extractNamedFunction(source, name))
    .filter((part): part is string => part !== null)
    .map(stripExport);
  return [...consts, ...fns].join('\n\n');
}

export function readLocalEditorContract(readLocalFile: (filePath: string) => string): string {
  const api = readLocalFile(LOCAL_EDITOR_CONTRACT_PATH);
  const extras = [LOCAL_VALIDATE_PATH, LOCAL_VALIDATE_REACH_PATH, LOCAL_KIT_PATH].map((filePath) => {
    const text = readLocalFile(filePath);
    return text === api ? '' : text;
  });
  return [api, ...extras].filter((text) => text.length > 0).join('\n');
}

export function defaultReadLocalFile(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}
