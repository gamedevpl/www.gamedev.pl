/**
 * Soft module-size budget for chat-thin / MCP builders.
 *
 * A single growing `render.ts` / `model.ts` forces full-file rewrites (or large
 * patches) on every tweak. Soft warnings nudge agents to split cohesive pieces
 * *before* adding more behavior — never a hard gate failure (catalog games already
 * exceed these ceilings).
 */

export const MODULE_SOFT_LIMIT_BYTES = 12 * 1024;
export const MODULE_SOFT_LIMIT_LINES = 350;

/** Local game TypeScript modules (not SPEC.md / TRACE / HTML; not the lean `game.ts` root). */
export function isGameTsModule(path: string): boolean {
  const normalized = path.trim().replaceAll('\\', '/');
  if (!normalized.endsWith('.ts')) return false;
  if (normalized === 'game.ts') return false; // composition root has its own lean rule
  if (normalized.includes('..') || normalized.startsWith('/')) return false;
  return true;
}

export type ModuleSizeAssessment = {
  path: string;
  bytes: number;
  lines: number;
  oversize: boolean;
};

export function assessModuleSize(path: string, content: string): ModuleSizeAssessment {
  const bytes = Buffer.byteLength(content, 'utf8');
  // Count like editors: a trailing newline does not invent an extra blank line for empty files.
  const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
  return {
    path,
    bytes,
    lines,
    oversize: bytes >= MODULE_SOFT_LIMIT_BYTES || lines >= MODULE_SOFT_LIMIT_LINES,
  };
}

function splitHintFor(path: string): string {
  const base = path.replace(/^game\//, '').replace(/\.ts$/, '');
  if (base === 'render' || base.endsWith('/render') || base.includes('paint') || base.includes('draw')) {
    return 'split paint helpers into cohesive modules (e.g. game/art.ts, game/ui.ts, game/hud.ts, game/rooms.ts) and leave a thin paintWorld/paintForeground orchestrator';
  }
  if (base === 'model' || base.endsWith('/model')) {
    return 'split tables/constants/types into cohesive modules (e.g. game/tables.ts, game/layout.ts, game/types.ts) and keep model.ts as the shared façade';
  }
  if (base === 'runtime' || base === 'simulation' || base.endsWith('/runtime') || base.endsWith('/simulation')) {
    return 'split input, round flow, or systems into cohesive modules (e.g. game/input-map.ts, game/systems/*.ts) rather than growing the lifecycle file';
  }
  return 'split cohesive concerns into new game/*.ts modules (one concept each) rather than growing this file further';
}

/** Soft warning message for one oversized module (MCP warnings.code=module_too_large). */
export function moduleTooLargeMessage(assessment: ModuleSizeAssessment): string {
  return (
    `${assessment.path} is ${assessment.lines} lines (${assessment.bytes} bytes) — over the soft budget ` +
    `(~${MODULE_SOFT_LIMIT_LINES} lines / ~${MODULE_SOFT_LIMIT_BYTES} bytes). ` +
    `Before adding more behavior, ${splitHintFor(assessment.path)}. ` +
    `Use patch_source_file({ path, old, new }) for later edits; do not keep expanding this monolith.`
  );
}

/** Hint string for channel stage/patch receipts (non-MCP clients). */
export function largeSourceFileHint(path: string, bytes: number, content?: string): string | null {
  if (!isGameTsModule(path) && !path.endsWith('.ts')) {
    // Still nudge huge non-ts? Skip — SPEC/TRACE are not the problem.
    return null;
  }
  const lines = content !== undefined ? assessModuleSize(path, content).lines : Math.ceil(bytes / 40);
  const assessment = {
    path,
    bytes,
    lines,
    oversize: bytes >= MODULE_SOFT_LIMIT_BYTES || lines >= MODULE_SOFT_LIMIT_LINES,
  };
  if (!assessment.oversize) return null;
  return moduleTooLargeMessage(assessment);
}

export type ModuleSizeWarning = { code: 'module_too_large'; message: string };

/**
 * Warnings for every oversized game/*.ts module in a file list (get_sources / get_seed).
 * Caps at a few so a carjack-sized tree does not drown the reply.
 */
export function moduleSizeWarnings(
  files: ReadonlyArray<{ path: string; content: string }>,
  options: { limit?: number } = {},
): ModuleSizeWarning[] {
  const limit = options.limit ?? 4;
  const oversized = files
    .filter((file) => isGameTsModule(file.path))
    .map((file) => assessModuleSize(file.path, file.content))
    .filter((entry) => entry.oversize)
    .sort((a, b) => b.bytes - a.bytes || b.lines - a.lines);
  return oversized.slice(0, limit).map((entry) => ({
    code: 'module_too_large' as const,
    message: moduleTooLargeMessage(entry),
  }));
}
