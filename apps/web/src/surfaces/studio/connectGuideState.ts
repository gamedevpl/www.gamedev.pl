export type GuideState = {
  route: 'cli' | 'agent' | 'platform' | null;
  tool: 'cursor' | 'vscode' | 'claudeCode' | 'codex' | 'kimi' | 'muse' | 'other' | null;
  stage: 'setup' | 'start';
  manual: boolean;
  windows: boolean;
};
const initial: GuideState = { route: null, tool: null, stage: 'setup', manual: false, windows: false };
const key = (token: string) => `gamedev_connect_guide:${token}`;
export function readGuideState(token: string): GuideState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key(token)) ?? 'null') as GuideState | null;
    if (
      !saved ||
      !['cli', 'agent', 'platform', null].includes(saved.route) ||
      !['cursor', 'vscode', 'claudeCode', 'codex', 'kimi', 'muse', 'other', null].includes(saved.tool) ||
      !['setup', 'start'].includes(saved.stage) ||
      typeof saved.manual !== 'boolean' ||
      typeof saved.windows !== 'boolean'
    )
      return initial;
    return {
      route: saved.route,
      tool: saved.route === 'agent' ? saved.tool : null,
      stage: saved.route && (saved.route !== 'agent' || saved.tool) ? saved.stage : 'setup',
      manual: saved.manual,
      windows: saved.windows,
    };
  } catch {
    return initial;
  }
}
export function saveGuideState(token: string, state: GuideState): void {
  try {
    sessionStorage.setItem(key(token), JSON.stringify(state));
  } catch {
    // Storage is optional.
  }
}
