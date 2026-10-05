import { capturePlanHint } from './capture-plan-hint.js';
import { gameManifestHint } from './game-manifest-hint.js';

// Shape nudge for a just-staged file; null for files nobody checks.
export function stagedFileHint(path: string, content: string): string | null {
  const normalized = path.trim().replaceAll('\\', '/');
  if (normalized === 'CAPTURE.json') return capturePlanHint(content);
  return gameManifestHint(path, content);
}
