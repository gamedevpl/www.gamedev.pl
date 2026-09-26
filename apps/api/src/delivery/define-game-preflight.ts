import ts from 'typescript';
import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';
import { InvalidUploadError, type SourceFile } from './games-store.js';

const REQUIRED_STEPS = ['input', 'audio', 'init', 'update', 'render', 'snapshot'] as const;
const REQUIRED_MODULES = ['input', 'gfx', 'effects', 'audio'] as const;

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function propertyCall(expression: ts.Expression): { name: string; receiver: ts.Expression } | null {
  const call = unwrap(expression);
  if (!ts.isCallExpression(call)) return null;
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  return { name: callee.name.text, receiver: unwrap(callee.expression) };
}

function defineGameSteps(expression: ts.Expression): Set<string> | null {
  const steps = new Set<string>();
  let current: ts.Expression = expression;
  for (;;) {
    const call = propertyCall(current);
    if (!call) return null;
    if (call.name === 'defineGame') {
      return ts.isIdentifier(call.receiver) && call.receiver.text === 'GameKit' ? steps : null;
    }
    steps.add(call.name);
    current = call.receiver;
  }
}

export function defineGamePreflight(files: SourceFile[]): string | null {
  const findings: string[] = [];
  let usesDefineGame = false;
  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const call = propertyCall(node);
        if (call?.name === 'defineGame' && ts.isIdentifier(call.receiver) && call.receiver.text === 'GameKit') {
          usesDefineGame = true;
        }
        if (call?.name === 'start') {
          const steps = defineGameSteps(call.receiver);
          if (steps) {
            const missing = REQUIRED_STEPS.filter((step) => !steps.has(step));
            if (missing.length) {
              const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
              findings.push(`${file.path}:${line}: missing ${missing.map((step) => `.${step}(...)`).join(', ')}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (usesDefineGame) {
    const rawManifest = files.find((file) => file.path.trim() === 'GAME.json')?.content;
    let modules: unknown;
    try {
      modules = (JSON.parse(rawManifest ?? '') as { engine?: { modules?: unknown } }).engine?.modules;
    } catch {
      findings.push('GAME.json: invalid or missing manifest for GameKit.defineGame');
    }
    if (Array.isArray(modules)) {
      const missing = REQUIRED_MODULES.filter((module) => !modules.includes(module));
      if (missing.length) {
        findings.push(
          `GAME.json: GameKit.defineGame requires engine.modules ${JSON.stringify(REQUIRED_MODULES)}; add ${JSON.stringify(missing)} in canonical order`,
        );
      }
      const canonical = GAME_KIT_MODULES.filter((module) => modules.includes(module));
      if (canonical.join(',') !== modules.join(',')) {
        findings.push(`GAME.json: engine.modules must follow canonical order ${JSON.stringify(canonical)}`);
      }
    } else if (rawManifest) {
      findings.push('GAME.json: GameKit.defineGame requires engine.modules');
    }
  }
  return findings.length
    ? `GameKit.defineGame preflight failed — fix before submit_sources:\n${findings.join('\n')}`
    : null;
}

export async function enforceDefineGamePreflight(files: SourceFile[], onRefusal: () => Promise<void>): Promise<void> {
  const message = defineGamePreflight(files);
  if (!message) return;
  await onRefusal();
  throw new InvalidUploadError(message, 'typecheck');
}
