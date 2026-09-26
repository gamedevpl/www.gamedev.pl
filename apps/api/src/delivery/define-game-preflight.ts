import { inspectDefineGameBuilders } from './define-game-builders.js';
import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';
import { InvalidUploadError, type SourceFile } from './games-store.js';

const REQUIRED_MODULES = ['input', 'gfx', 'effects', 'audio'] as const;

export function defineGamePreflight(files: SourceFile[]): string | null {
  const findings: string[] = [];
  let usesDefineGame = false;
  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue;
    const inspected = inspectDefineGameBuilders(file.path, file.content);
    usesDefineGame ||= inspected.usesDefineGame;
    findings.push(...inspected.findings);
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
