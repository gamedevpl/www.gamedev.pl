export type Glyphs = { agent: string; prompt: string; ok: string; work: string };

export function glyphs(color: boolean): Glyphs {
  if (!color) return { agent: '*', prompt: '>', ok: '*', work: '.' };
  return { agent: '◆', prompt: '›', ok: '✓', work: '▸' };
}

export function wantsColor(env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR === '0') return false;
  return isTty;
}
