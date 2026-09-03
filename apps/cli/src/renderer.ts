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

export interface TwoRegion {
  transcript: string[];
  live: string[];
}

export function createTwoRegion(maxLive = 4): TwoRegion & {
  print(line: string): void;
  setLive(lines: string[]): void;
  promote(line: string): void;
} {
  const transcript: string[] = [];
  let live: string[] = [];
  return {
    get transcript() {
      return transcript;
    },
    get live() {
      return live;
    },
    print(line: string) {
      transcript.push(line);
    },
    setLive(lines: string[]) {
      live = lines.slice(0, maxLive);
    },
    promote(line: string) {
      transcript.push(line);
      live = [];
    },
  };
}

export function renderLive(live: readonly string[], width: number): string {
  return live.map((line) => (line.length <= width ? line : `${line.slice(0, Math.max(1, width - 1))}…`)).join('\n');
}
